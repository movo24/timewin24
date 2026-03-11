/**
 * Auto-Planning Solver — Clean 4-step algorithm.
 *
 * 100% pure TypeScript, no DB access.
 * Receives a denormalized SolverInput and returns SolverResult.
 *
 * 4 clear steps per day:
 *   1. buildCoverageSlots() — split store hours into shift-sized slots
 *   2. getEligibleEmployees() — filter employees who can work each slot
 *   3. scoreEmployeeForSlot() — simple penalty-based scoring
 *   4. createUnassignedShift() — fallback if nobody fits
 *
 * Rules:
 *   - maxShift = 8h (hard limit)
 *   - idealShift = 4-6h (preferred)
 *   - pauseAuto = 30min if shift > 6h
 *   - always create unassigned shifts when no candidate available
 *   - never crash, never block — try/catch around every slot
 */

import type {
  SolverInput,
  SolverResult,
  GeneratedShift,
  SolverShift,
  SolverExistingShift,
  SolverStore,
  SolverEmployee,
  EmployeeState,
  DaySlot,
  SolverOptions,
  ScenarioConfig,
  ScenarioResult,
  ScoredScenario,
} from "./types";
import { DEFAULT_SCENARIO_CONFIG } from "./types";
import { passesAllHardConstraints } from "./constraints";
import {
  calculateCandidateScore,
  DEFAULT_WEIGHTS,
  SCORING_PROFILES,
  type ScoringWeights,
} from "./scoring";
import { scoreScenario } from "./scenario-scoring";

// ─── Internal Types ─────────────────────────────

interface CoverageSlot {
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  hours: number;
  breakMinutes: number; // 30 if > 6h, 0 otherwise
  label: string; // "matin", "après-midi", "journée"
}

interface TimeRange {
  start: number; // minutes from midnight
  end: number;
}

/** Options passed to solve() / solveMultiStore() */
interface SolveOptions {
  weights?: ScoringWeights;
  assignmentOrder?: "score-desc" | "fairness-first";
}

// ─── Time Helpers ───────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number): string {
  const h = String(Math.floor(m / 60)).padStart(2, "0");
  const min = String(m % 60).padStart(2, "0");
  return `${h}:${min}`;
}

function roundTo15(m: number): number {
  return Math.round(m / 15) * 15;
}

function calculateHoursFromTimes(startTime: string, endTime: string): number {
  return (timeToMinutes(endTime) - timeToMinutes(startTime)) / 60;
}

// ═══════════════════════════════════════════════════
// STEP 1 — BUILD COVERAGE SLOTS
// ═══════════════════════════════════════════════════

/**
 * Find time ranges within [openMin, closeMin] NOT covered by existing shifts.
 */
function findUncoveredRanges(
  openMin: number,
  closeMin: number,
  existingShiftsForDay: { startTime: string; endTime: string }[]
): TimeRange[] {
  if (existingShiftsForDay.length === 0) {
    return [{ start: openMin, end: closeMin }];
  }

  // Convert existing shifts to time ranges and sort by start
  const covered: TimeRange[] = existingShiftsForDay
    .map((s) => ({
      start: Math.max(openMin, timeToMinutes(s.startTime)),
      end: Math.min(closeMin, timeToMinutes(s.endTime)),
    }))
    .filter((r) => r.start < r.end)
    .sort((a, b) => a.start - b.start);

  // Merge overlapping covered ranges
  const merged: TimeRange[] = [];
  for (const r of covered) {
    if (merged.length === 0 || r.start > merged[merged.length - 1].end) {
      merged.push({ ...r });
    } else {
      merged[merged.length - 1].end = Math.max(
        merged[merged.length - 1].end,
        r.end
      );
    }
  }

  // Find gaps between covered ranges
  const uncovered: TimeRange[] = [];
  let cursor = openMin;
  for (const r of merged) {
    if (cursor < r.start) {
      uncovered.push({ start: cursor, end: r.start });
    }
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < closeMin) {
    uncovered.push({ start: cursor, end: closeMin });
  }

  return uncovered;
}

/**
 * Split uncovered ranges into shift-sized slots.
 * Uses idealRange for smart splitting when available.
 */
function generateSlotsForRanges(
  uncoveredRanges: TimeRange[],
  minEmployeesPerSlot: number,
  shiftDurationHours: number,
  idealRange?: [number, number]
): CoverageSlot[] {
  const slots: CoverageSlot[] = [];
  const maxShiftMin = shiftDurationHours * 60;

  for (const range of uncoveredRanges) {
    const rangeMin = range.end - range.start;
    const rangeHours = rangeMin / 60;

    // Skip very short gaps (< 1 hour)
    if (rangeHours < 1) continue;

    // How many time segments needed?
    let segmentCount: number;
    if (idealRange) {
      // Smart splitting: target the center of the ideal range
      const idealCenter = ((idealRange[0] + idealRange[1]) / 2) * 60;
      segmentCount = Math.max(1, Math.round(rangeMin / idealCenter));
      // Hard cap: no segment > 8h
      while (rangeMin / segmentCount > 8 * 60 && segmentCount < 10) {
        segmentCount++;
      }
    } else {
      segmentCount = Math.ceil(rangeMin / maxShiftMin);
    }

    if (segmentCount === 1) {
      // Single segment covers the whole range
      const breakMins = rangeHours > 6 ? 30 : 0;
      for (let i = 0; i < minEmployeesPerSlot; i++) {
        slots.push({
          startTime: minutesToTime(range.start),
          endTime: minutesToTime(range.end),
          hours: rangeHours,
          breakMinutes: breakMins,
          label: "journée",
        });
      }
    } else {
      // Split range into segments, rounding transitions to 15-minute boundaries
      const segmentDuration = Math.round(rangeMin / segmentCount);

      let prevEnd = range.start; // Track previous segment end to avoid gaps
      for (let si = 0; si < segmentCount; si++) {
        const rawSegEnd =
          si === segmentCount - 1
            ? range.end
            : range.start + (si + 1) * segmentDuration;

        // First segment starts at range boundary, others chain from previous end
        const segStart = si === 0 ? range.start : prevEnd;
        const segEnd =
          si === segmentCount - 1 ? range.end : roundTo15(rawSegEnd);
        // Clamp: ensure segment stays within store hours
        const clampedStart = Math.max(segStart, range.start);
        const clampedEnd = Math.min(segEnd, range.end);

        const segHours = (clampedEnd - clampedStart) / 60;
        prevEnd = clampedEnd; // Chain next segment from here
        if (segHours < 0.5) continue; // Skip tiny segments

        const breakMins = segHours > 6 ? 30 : 0;
        const label =
          si === 0
            ? "matin"
            : si === segmentCount - 1
              ? "après-midi"
              : "milieu";

        for (let i = 0; i < minEmployeesPerSlot; i++) {
          slots.push({
            startTime: minutesToTime(clampedStart),
            endTime: minutesToTime(clampedEnd),
            hours: segHours,
            breakMinutes: breakMins,
            label,
          });
        }
      }
    }
  }

  return slots;
}

/**
 * Step 1 — Build all coverage slots for one day.
 * Finds gaps in existing coverage and generates shift-sized slots.
 */
function buildCoverageSlots(
  store: SolverStore,
  daySlot: DaySlot,
  existingShifts: SolverExistingShift[],
  options: SolverOptions
): { slots: CoverageSlot[]; existingForDay: SolverExistingShift[] } {
  const { date, schedule } = daySlot;
  const openMin = timeToMinutes(schedule.openTime);
  const closeMin = timeToMinutes(schedule.closeTime);

  // Existing shifts for this day+store
  const existingForDay = existingShifts.filter(
    (s) => s.date === date && s.storeId === store.id
  );

  // Find uncovered time ranges
  const uncoveredRanges = findUncoveredRanges(
    openMin,
    closeMin,
    existingForDay
  );
  const totalUncoveredHours = uncoveredRanges.reduce(
    (sum, r) => sum + (r.end - r.start) / 60,
    0
  );

  // If everything is covered (or gaps are tiny), skip
  if (totalUncoveredHours < 0.5) {
    return { slots: [], existingForDay };
  }

  // Cap employees per slot at maxSimultaneous (no point creating parallel
  // slots that the constraint check will always reject).
  // Also force 1 when overlap is explicitly forbidden.
  const storeMaxSim = schedule.maxSimultaneous ?? store.maxSimultaneous;
  const effectiveMinEmployees = Math.min(
    schedule.minEmployees,
    storeMaxSim,
    store.allowOverlap ? schedule.minEmployees : 1
  );

  const slots = generateSlotsForRanges(
    uncoveredRanges,
    effectiveMinEmployees,
    options.shiftDurationHours,
    options.idealShiftRange
  );

  return { slots, existingForDay };
}

// ═══════════════════════════════════════════════════
// STEP 2 — GET ELIGIBLE EMPLOYEES
// ═══════════════════════════════════════════════════

/**
 * Step 2 — Find all employees who CAN work this slot.
 * Runs all hard constraints: overlap, availability, daily/weekly max, rest, preference.
 * Never crashes — skips any employee that throws.
 */
function getEligibleEmployees(
  employees: SolverEmployee[],
  employeeStates: Map<string, EmployeeState>,
  date: string,
  dayOfWeek: number,
  slot: CoverageSlot,
  existingShifts: SolverExistingShift[],
  generatedShifts: SolverShift[],
  storeOpenTime: string,
  storeCloseTime: string,
  storeId?: string,
  storeMaxOverlapMinutes?: number | null,
  storeMaxEmployees?: number | null,
  storeMaxSimultaneous?: number
): SolverEmployee[] {
  const eligible: SolverEmployee[] = [];

  for (const emp of employees) {
    try {
      const state = employeeStates.get(emp.id);
      if (!state) continue;

      if (
        passesAllHardConstraints(
          emp,
          state,
          date,
          dayOfWeek,
          slot.startTime,
          slot.endTime,
          slot.hours,
          existingShifts,
          generatedShifts,
          storeOpenTime,
          storeCloseTime,
          storeId,
          storeMaxOverlapMinutes,
          storeMaxEmployees,
          storeMaxSimultaneous
        )
      ) {
        eligible.push(emp);
      }
    } catch {
      // Never crash on a constraint check — skip this employee
      continue;
    }
  }

  return eligible;
}

// ═══════════════════════════════════════════════════
// STEP 3 — SCORE & ASSIGN
// ═══════════════════════════════════════════════════

/**
 * Step 3a — Score an employee for a slot.
 * Simple penalty-based: score = 100 - penalties + bonuses.
 *
 * Penalties:
 *   -25  shift > 6h (long shift fatigue)
 *   -15  employee already worked today
 *   -10  employee exceeds weekly contractual target
 *
 * Bonuses:
 *   +10  employee has good remaining capacity (needs hours)
 *   +5   preferred store match
 *   +5   CDI priority (stable contract)
 */
function scoreEmployeeForSlot(
  employee: SolverEmployee,
  state: EmployeeState,
  date: string,
  slotHours: number,
  storeId: string
): number {
  let score = 100;

  // ─── Penalties ───

  // Long shift penalty
  if (slotHours > 6) score -= 25;

  // Already working today → overloading
  const dailyHours = state.dailyHours.get(date) || 0;
  if (dailyHours > 0) score -= 15;

  // Would exceed weekly contractual target
  const target = employee.weeklyHours || 35;
  const afterAssignment = state.weeklyHoursAssigned + slotHours;
  if (target > 0 && afterAssignment > target) score -= 10;

  // ─── Bonuses ───

  // Good remaining capacity (needs more hours to reach target)
  if (target > 0) {
    const remaining = target - state.weeklyHoursAssigned;
    if (remaining >= slotHours) score += 10;
  }

  // Preferred store
  if (employee.preferredStoreId === storeId) score += 5;

  // CDI priority bonus
  if (employee.priority === 1) score += 5;

  return score;
}

/**
 * Step 3b — Pick the best employee from eligible candidates.
 * Scores all candidates and returns the highest-scoring one.
 *
 * When assignmentOrder is "fairness-first", prioritizes employees
 * with the most remaining capacity (for better hour distribution).
 *
 * When weightedScoring is provided (multi-scenario mode), uses
 * the weighted composite scoring instead of simple penalties.
 */
function assignBestEmployee(
  eligible: SolverEmployee[],
  employeeStates: Map<string, EmployeeState>,
  date: string,
  slot: CoverageSlot,
  storeId: string,
  assignmentOrder: "score-desc" | "fairness-first" = "score-desc",
  weightedScoring?: {
    weights: ScoringWeights;
    minCost: number;
    maxCost: number;
    avgPoolHours: number;
  }
): { employee: SolverEmployee; score: number } | null {
  if (eligible.length === 0) return null;

  // Score all candidates
  const scored = eligible.map((emp) => {
    const state = employeeStates.get(emp.id)!;
    let score: number;

    if (weightedScoring) {
      // Multi-scenario mode: use weighted scoring profiles
      score = calculateCandidateScore(
        emp,
        state,
        slot.hours,
        storeId,
        weightedScoring.minCost,
        weightedScoring.maxCost,
        weightedScoring.avgPoolHours,
        weightedScoring.weights
      );
    } else {
      // Default: simple penalty-based scoring
      score = scoreEmployeeForSlot(emp, state, date, slot.hours, storeId);
    }

    return { employee: emp, score };
  });

  // Sort based on assignment strategy
  if (assignmentOrder === "fairness-first") {
    // Sort by remaining capacity descending, score as tiebreak
    scored.sort((a, b) => {
      const aRemaining =
        (a.employee.weeklyHours || 35) -
        (employeeStates.get(a.employee.id)?.weeklyHoursAssigned || 0);
      const bRemaining =
        (b.employee.weeklyHours || 35) -
        (employeeStates.get(b.employee.id)?.weeklyHoursAssigned || 0);
      if (Math.abs(aRemaining - bRemaining) > 0.5)
        return bRemaining - aRemaining;
      return b.score - a.score;
    });
  } else {
    // Default: sort by score descending
    scored.sort((a, b) => b.score - a.score);
  }

  return scored[0];
}

// ═══════════════════════════════════════════════════
// STEP 4 — CREATE SHIFTS
// ═══════════════════════════════════════════════════

/**
 * Step 4a — Create an assigned shift (employee found).
 * Updates employee state and returns the generated shift.
 */
function createAssignedShift(
  employee: SolverEmployee,
  slot: CoverageSlot,
  store: SolverStore,
  date: string,
  state: EmployeeState
): { generated: GeneratedShift; raw: SolverShift } {
  const raw: SolverShift = {
    employeeId: employee.id,
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    hours: slot.hours,
  };

  // Update employee state
  updateState(state, raw);

  // Per-shift warnings
  const warnings: string[] = [];
  if (
    employee.weeklyHours &&
    state.weeklyHoursAssigned > employee.weeklyHours
  ) {
    warnings.push(
      `Dépasse les ${employee.weeklyHours}h contractuelles (${state.weeklyHoursAssigned.toFixed(1)}h cette semaine)`
    );
  }

  const generated: GeneratedShift = {
    employeeId: employee.id,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    storeId: store.id,
    storeName: store.name,
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    hours: slot.hours,
    breakMinutes: slot.breakMinutes,
    warnings,
  };

  return { generated, raw };
}

/**
 * Step 4b — Create an unassigned shift (no eligible employee).
 * Always succeeds — guarantees coverage visibility.
 */
function createUnassignedShift(
  slot: CoverageSlot,
  store: SolverStore,
  date: string
): { generated: GeneratedShift; raw: SolverShift } {
  const raw: SolverShift = {
    employeeId: null,
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    hours: slot.hours,
  };

  const generated: GeneratedShift = {
    employeeId: null,
    employeeName: "NON ASSIGNÉ",
    storeId: store.id,
    storeName: store.name,
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    hours: slot.hours,
    breakMinutes: slot.breakMinutes,
    warnings: ["Aucun employé éligible"],
  };

  return { generated, raw };
}

// ═══════════════════════════════════════════════════
// STATE HELPERS
// ═══════════════════════════════════════════════════

function initializeStates(
  employees: SolverEmployee[],
  existingShifts: SolverExistingShift[]
): Map<string, EmployeeState> {
  const states = new Map<string, EmployeeState>();

  for (const emp of employees) {
    states.set(emp.id, {
      weeklyHoursAssigned: 0,
      dailyHours: new Map(),
      shifts: [],
    });
  }

  for (const shift of existingShifts) {
    if (!shift.employeeId) continue; // Skip unassigned shifts
    const state = states.get(shift.employeeId);
    if (!state) continue;

    const hours = calculateHoursFromTimes(shift.startTime, shift.endTime);
    state.weeklyHoursAssigned += hours;
    state.dailyHours.set(
      shift.date,
      (state.dailyHours.get(shift.date) || 0) + hours
    );
    state.shifts.push({
      employeeId: shift.employeeId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      hours,
    });
  }

  return states;
}

function updateState(state: EmployeeState, shift: SolverShift): void {
  state.weeklyHoursAssigned += shift.hours;
  state.dailyHours.set(
    shift.date,
    (state.dailyHours.get(shift.date) || 0) + shift.hours
  );
  state.shifts.push(shift);
}

function computePoolStats(employees: SolverEmployee[]) {
  const costs = employees
    .map((e) => e.costPerHour)
    .filter((c): c is number => c !== null);

  const minCost = costs.length > 0 ? Math.min(...costs) : 0;
  const maxCost = costs.length > 0 ? Math.max(...costs) : 0;

  const targets = employees
    .map((e) => e.weeklyHours)
    .filter((h): h is number => h !== null && h > 0);
  const avgPoolHours =
    targets.length > 0
      ? targets.reduce((a, b) => a + b, 0) / targets.length
      : 35;

  return { minCost, maxCost, avgPoolHours };
}

// ═══════════════════════════════════════════════════
// MAIN SOLVER
// ═══════════════════════════════════════════════════

/**
 * Main solver — plans one store for one week.
 *
 * For each open day:
 *   1. Build coverage slots from uncovered time ranges
 *   2. For each slot, find eligible employees
 *   3. Score and assign the best candidate
 *   4. If nobody fits, create an unassigned shift
 *
 * Never crashes — each slot is wrapped in try/catch.
 * Always produces a result, even if incomplete.
 */
export function solve(
  input: SolverInput,
  solveOptions: SolveOptions = {}
): SolverResult {
  const startTime = performance.now();
  const { weights, assignmentOrder = "score-desc" } = solveOptions;

  const { store, employees, existingShifts, weekDays, options } = input;

  const generatedShifts: GeneratedShift[] = [];
  const allGeneratedRaw: SolverShift[] = [];
  const warnings: string[] = [];
  const employeeStates = initializeStates(employees, existingShifts);
  const poolStats = computePoolStats(employees);
  const employeesUsedSet = new Set<string>();

  let daysFullyCovered = 0;
  let daysPartiallyCovered = 0;
  let daysUncovered = 0;
  let assignedCount = 0;
  let unassignedCount = 0;

  // Weighted scoring context (only for multi-scenario mode)
  const weightedScoring = weights
    ? {
        weights,
        minCost: poolStats.minCost,
        maxCost: poolStats.maxCost,
        avgPoolHours: poolStats.avgPoolHours,
      }
    : undefined;

  for (const daySlot of weekDays) {
    const { date, dayOfWeek, schedule } = daySlot;

    try {
      // ─── Step 1: Build coverage slots ───
      const { slots, existingForDay } = buildCoverageSlots(
        store,
        daySlot,
        existingShifts,
        options
      );

      if (slots.length === 0) {
        daysFullyCovered++;
        continue;
      }

      // Warn if overlap forbidden but minEmployees > 1
      if (!store.allowOverlap && schedule.minEmployees > 1) {
        warnings.push(
          `${date}: chevauchement interdit — couverture limitée à 1 employé par créneau (min demandé: ${schedule.minEmployees})`
        );
      }

      let filledThisDay = 0;
      const totalSlotsNeeded = slots.length;

      // ─── Process each slot ───
      const storeMaxOverlap = store.allowOverlap ? store.maxOverlapMinutes : 0;
      const storeMaxSimultaneous = schedule.maxSimultaneous ?? store.maxSimultaneous;

      for (const slot of slots) {
        try {
          // Step 2: Get eligible employees
          // maxEmployees is now enforced per-candidate inside passesAllHardConstraints
          const eligible = getEligibleEmployees(
            employees,
            employeeStates,
            date,
            dayOfWeek,
            slot,
            existingShifts,
            allGeneratedRaw,
            schedule.openTime,
            schedule.closeTime,
            store.id,
            storeMaxOverlap,
            schedule.maxEmployees,
            storeMaxSimultaneous
          );

          // Step 3: Score & assign best employee
          const best = assignBestEmployee(
            eligible,
            employeeStates,
            date,
            slot,
            store.id,
            assignmentOrder,
            weightedScoring
          );

          if (best) {
            // Step 4a: Create assigned shift
            const state = employeeStates.get(best.employee.id)!;
            const { generated, raw } = createAssignedShift(
              best.employee,
              slot,
              store,
              date,
              state
            );
            allGeneratedRaw.push(raw);
            generatedShifts.push(generated);
            employeesUsedSet.add(best.employee.id);
            assignedCount++;
          } else {
            // Step 4b: Create unassigned shift
            warnings.push(
              `${date} (${slot.label} ${slot.startTime}-${slot.endTime}): aucun employé — shift non assigné`
            );
            const { generated, raw } = createUnassignedShift(
              slot,
              store,
              date
            );
            allGeneratedRaw.push(raw);
            generatedShifts.push(generated);
            unassignedCount++;
          }

          filledThisDay++;
        } catch (slotErr) {
          // Never crash on a single slot — log and create fallback
          console.warn(
            `[Solver] Erreur slot ${date} ${slot.startTime}-${slot.endTime}:`,
            slotErr
          );

          // Create unassigned as fallback
          try {
            const { generated, raw } = createUnassignedShift(
              slot,
              store,
              date
            );
            allGeneratedRaw.push(raw);
            generatedShifts.push(generated);
            unassignedCount++;
            filledThisDay++;
          } catch {
            // Absolute last resort — skip this slot entirely
          }
        }
      }

      // Coverage tracking
      if (filledThisDay >= totalSlotsNeeded) {
        daysFullyCovered++;
      } else if (filledThisDay > 0) {
        daysPartiallyCovered++;
        warnings.push(
          `${date}: couverture partielle (${filledThisDay}/${totalSlotsNeeded} créneaux remplis)`
        );
      } else {
        daysUncovered++;
        warnings.push(`${date}: aucun employé n'a pu être affecté`);
      }

      // Manager check
      if (store.needsManager) {
        const hasManagerExisting = existingForDay.some((s) => {
          const emp = employees.find((e) => e.id === s.employeeId);
          return emp?.skills.includes("MANAGER");
        });
        const hasManagerGenerated = generatedShifts.some(
          (s) =>
            s.date === date &&
            employees
              .find((e) => e.id === s.employeeId)
              ?.skills.includes("MANAGER")
        );

        if (!hasManagerExisting && !hasManagerGenerated) {
          warnings.push(
            `${date}: aucun manager planifié (magasin requiert un manager)`
          );
        }
      }
    } catch (dayErr) {
      // Never crash on a full day — log and mark uncovered
      console.warn(`[Solver] Erreur jour ${daySlot.date}:`, dayErr);
      daysUncovered++;
      warnings.push(`${daySlot.date}: erreur interne — jour non planifié`);
    }
  }

  const solveTimeMs = performance.now() - startTime;
  const totalHours = generatedShifts.reduce((sum, s) => sum + s.hours, 0);

  return {
    shifts: generatedShifts,
    warnings,
    stats: {
      totalShiftsGenerated: generatedShifts.length,
      assignedCount,
      unassignedCount,
      totalHoursGenerated: totalHours,
      daysFullyCovered,
      daysPartiallyCovered,
      daysUncovered,
      employeesUsed: employeesUsedSet.size,
      solveTimeMs: Math.round(solveTimeMs * 100) / 100,
    },
  };
}

// ═══════════════════════════════════════════════════
// MULTI-STORE SOLVER
// ═══════════════════════════════════════════════════

/**
 * Solve planning for multiple stores.
 * Runs solver for each store, feeding generated shifts as "existing"
 * to the next store (ensures cross-store constraint respect).
 */
export function solveMultiStore(
  inputs: SolverInput[],
  solveOptions: SolveOptions = {}
): SolverResult {
  const startTime = performance.now();

  const allShifts: GeneratedShift[] = [];
  const allWarnings: string[] = [];
  let totalDaysFullyCovered = 0;
  let totalDaysPartiallyCovered = 0;
  let totalDaysUncovered = 0;
  let totalAssigned = 0;
  let totalUnassigned = 0;
  const allEmployeesUsed = new Set<string>();

  // Cumulative generated shifts (fed as "existing" to next store)
  let cumulativeShifts: SolverExistingShift[] = [];

  for (const input of inputs) {
    try {
      // Add previously generated shifts to this store's existing shifts
      const enrichedInput: SolverInput = {
        ...input,
        existingShifts: [...input.existingShifts, ...cumulativeShifts],
      };

      const result = solve(enrichedInput, solveOptions);

      // Collect results
      allShifts.push(...result.shifts);
      allWarnings.push(
        ...result.warnings.map((w) => `[${input.store.name}] ${w}`)
      );
      totalDaysFullyCovered += result.stats.daysFullyCovered;
      totalDaysPartiallyCovered += result.stats.daysPartiallyCovered;
      totalDaysUncovered += result.stats.daysUncovered;
      totalAssigned += result.stats.assignedCount;
      totalUnassigned += result.stats.unassignedCount;

      for (const s of result.shifts) {
        if (s.employeeId) allEmployeesUsed.add(s.employeeId);
      }

      // Add generated shifts as "existing" for next store
      const newExisting: SolverExistingShift[] = result.shifts.map((s, i) => ({
        id: `gen-${input.store.id}-${i}`,
        employeeId: s.employeeId,
        storeId: s.storeId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
      }));
      cumulativeShifts = [...cumulativeShifts, ...newExisting];
    } catch (storeErr) {
      // Never crash on a store — log and continue
      console.warn(`[Solver] Erreur store ${input.store.name}:`, storeErr);
      allWarnings.push(
        `[${input.store.name}] Erreur interne — magasin non planifié`
      );
    }
  }

  const solveTimeMs = performance.now() - startTime;
  const totalHours = allShifts.reduce((sum, s) => sum + s.hours, 0);

  return {
    shifts: allShifts,
    warnings: allWarnings,
    stats: {
      totalShiftsGenerated: allShifts.length,
      assignedCount: totalAssigned,
      unassignedCount: totalUnassigned,
      totalHoursGenerated: totalHours,
      daysFullyCovered: totalDaysFullyCovered,
      daysPartiallyCovered: totalDaysPartiallyCovered,
      daysUncovered: totalDaysUncovered,
      employeesUsed: allEmployeesUsed.size,
      solveTimeMs: Math.round(solveTimeMs * 100) / 100,
    },
  };
}

// ═══════════════════════════════════════════════════
// MULTI-SCENARIO SOLVER
// ═══════════════════════════════════════════════════

/** Empty result for error fallback */
function emptyScenarioFallback(
  id: string,
  params: ScoredScenario["params"]
): ScoredScenario {
  return {
    id,
    params,
    result: {
      shifts: [],
      warnings: ["Erreur interne"],
      stats: {
        totalShiftsGenerated: 0,
        assignedCount: 0,
        unassignedCount: 0,
        totalHoursGenerated: 0,
        daysFullyCovered: 0,
        daysPartiallyCovered: 0,
        daysUncovered: 0,
        employeesUsed: 0,
        solveTimeMs: 0,
      },
    },
    score: {
      total: 0,
      breakdown: {
        coverageCompleteness: 0,
        shiftDurationQuality: 0,
        employeeBalance: 0,
        constraintRespect: 0,
        costEfficiency: 0,
        breakQuality: 0,
      },
      label: "Insuffisant",
    },
  };
}

/**
 * Generate multiple planning scenarios, score each, return best.
 *
 * Strategy (3-phase):
 *   Phase 1: All durations × balanced (5 solves)
 *   Phase 2: Top 2 durations × other profiles (4 solves)
 *   Phase 3: Top 3 × fairness-first (3 solves)
 *   Total: ≤12 solves
 */
export function solveWithScenarios(
  input: SolverInput,
  config: ScenarioConfig = DEFAULT_SCENARIO_CONFIG
): ScenarioResult {
  const startTime = performance.now();
  const allScenarios: ScoredScenario[] = [];

  function runScenario(
    durationHours: number,
    profileName: string,
    order: "score-desc" | "fairness-first"
  ): ScoredScenario {
    const params = {
      shiftDurationHours: durationHours,
      scoringProfile: profileName,
      assignmentOrder: order,
    };
    const id = `scenario-dur${durationHours}-${profileName}-${order}`;

    try {
      const weights = SCORING_PROFILES[profileName] || DEFAULT_WEIGHTS;
      const scenarioInput: SolverInput = {
        ...input,
        options: {
          ...input.options,
          shiftDurationHours: durationHours,
          idealShiftRange: config.idealShiftHours,
        },
      };

      const result = solve(scenarioInput, {
        weights,
        assignmentOrder: order,
      });
      const score = scoreScenario(result, input, config);

      return { id, params, result, score };
    } catch (err) {
      console.warn(`[Solver] Erreur scenario ${id}:`, err);
      return emptyScenarioFallback(id + "-error", params);
    }
  }

  // Phase 1: All durations with balanced weights
  for (const dur of config.durationsToTry) {
    allScenarios.push(runScenario(dur, "balanced", "score-desc"));
  }

  // Phase 2: Top 2 durations × other profiles
  allScenarios.sort((a, b) => b.score.total - a.score.total);
  const topDurations = [
    ...new Set(
      allScenarios.slice(0, 2).map((s) => s.params.shiftDurationHours)
    ),
  ];
  const otherProfiles = Object.keys(SCORING_PROFILES).filter(
    (p) => p !== "balanced"
  );
  for (const dur of topDurations) {
    for (const profile of otherProfiles) {
      if (allScenarios.length >= config.maxScenarios) break;
      allScenarios.push(runScenario(dur, profile, "score-desc"));
    }
  }

  // Phase 3: Top 3 × fairness-first
  allScenarios.sort((a, b) => b.score.total - a.score.total);
  const topForFairness = allScenarios.slice(0, 3);
  for (const scenario of topForFairness) {
    if (allScenarios.length >= config.maxScenarios) break;
    allScenarios.push(
      runScenario(
        scenario.params.shiftDurationHours,
        scenario.params.scoringProfile,
        "fairness-first"
      )
    );
  }

  // Final sort
  allScenarios.sort((a, b) => b.score.total - a.score.total);

  const totalTimeMs =
    Math.round((performance.now() - startTime) * 100) / 100;

  return {
    best: allScenarios[0],
    alternatives: allScenarios.slice(1, 4),
    suggestions: [],
    totalScenariosEvaluated: allScenarios.length,
    totalTimeMs,
  };
}

/**
 * Multi-store version of solveWithScenarios.
 * Same 3-phase pruning strategy, wraps solveMultiStore.
 */
export function solveMultiStoreWithScenarios(
  inputs: SolverInput[],
  config: ScenarioConfig = DEFAULT_SCENARIO_CONFIG
): ScenarioResult {
  const startTime = performance.now();
  const allScenarios: ScoredScenario[] = [];

  function runScenario(
    durationHours: number,
    profileName: string,
    order: "score-desc" | "fairness-first"
  ): ScoredScenario {
    const params = {
      shiftDurationHours: durationHours,
      scoringProfile: profileName,
      assignmentOrder: order,
    };
    const id = `multi-scenario-dur${durationHours}-${profileName}-${order}`;

    try {
      const weights = SCORING_PROFILES[profileName] || DEFAULT_WEIGHTS;
      const scenarioInputs = inputs.map((input) => ({
        ...input,
        options: {
          ...input.options,
          shiftDurationHours: durationHours,
          idealShiftRange: config.idealShiftHours as [number, number],
        },
      }));

      const result = solveMultiStore(scenarioInputs, {
        weights,
        assignmentOrder: order,
      });
      const score = scoreScenario(result, inputs, config);

      return { id, params, result, score };
    } catch (err) {
      console.warn(`[Solver] Erreur multi-scenario ${id}:`, err);
      return emptyScenarioFallback(id + "-error", params);
    }
  }

  // Phase 1: All durations with balanced
  for (const dur of config.durationsToTry) {
    allScenarios.push(runScenario(dur, "balanced", "score-desc"));
  }

  // Phase 2: Top 2 × other profiles
  allScenarios.sort((a, b) => b.score.total - a.score.total);
  const topDurations = [
    ...new Set(
      allScenarios.slice(0, 2).map((s) => s.params.shiftDurationHours)
    ),
  ];
  const otherProfiles = Object.keys(SCORING_PROFILES).filter(
    (p) => p !== "balanced"
  );
  for (const dur of topDurations) {
    for (const profile of otherProfiles) {
      if (allScenarios.length >= config.maxScenarios) break;
      allScenarios.push(runScenario(dur, profile, "score-desc"));
    }
  }

  // Phase 3: Top 3 × fairness-first
  allScenarios.sort((a, b) => b.score.total - a.score.total);
  const topForFairness = allScenarios.slice(0, 3);
  for (const scenario of topForFairness) {
    if (allScenarios.length >= config.maxScenarios) break;
    allScenarios.push(
      runScenario(
        scenario.params.shiftDurationHours,
        scenario.params.scoringProfile,
        "fairness-first"
      )
    );
  }

  allScenarios.sort((a, b) => b.score.total - a.score.total);

  const totalTimeMs =
    Math.round((performance.now() - startTime) * 100) / 100;

  return {
    best: allScenarios[0],
    alternatives: allScenarios.slice(1, 4),
    suggestions: [],
    totalScenariosEvaluated: allScenarios.length,
    totalTimeMs,
  };
}

/**
 * Auto-Planning Solver — Clean 4-step algorithm with Manager Brain.
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
 * Manager Brain additions:
 *   - classifySlotPhase() — classify slots as OUVERTURE/FERMETURE/MILIEU
 *   - Phase-ordered processing: all OUVERTUREs first, then FERMETUREs, then MILIEUs
 *   - Coworker detection for profile safety constraints
 *   - Assignment reasons for explainability
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
  SlotPhase,
  ClassifiedSlot,
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
  useManagerBrain?: boolean;
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
// MANAGER BRAIN — Slot Classification & Helpers
// ═══════════════════════════════════════════════════

/**
 * Classify a slot as OUVERTURE, FERMETURE, or MILIEU based on store hours.
 */
function classifySlotPhase(
  slotStart: string,
  slotEnd: string,
  storeOpen: string,
  storeClose: string,
): SlotPhase {
  const start = timeToMinutes(slotStart);
  const end = timeToMinutes(slotEnd);
  const open = timeToMinutes(storeOpen);
  const close = timeToMinutes(storeClose);

  if (start <= open + 30) return "OUVERTURE";
  if (end >= close - 30) return "FERMETURE";
  return "MILIEU";
}

/**
 * Compute slot priority for global ordering.
 * OUVERTURE first (0-99), then FERMETURE (1000-1099), then MILIEU (2000-2099).
 * Within each phase, critical stores (importance=1) come first.
 */
function computeSlotPriority(phase: SlotPhase, importance: number): number {
  const phaseWeight = phase === "OUVERTURE" ? 0 : phase === "FERMETURE" ? 1000 : 2000;
  return phaseWeight + importance;
}

/**
 * Find all employees (from existing + generated shifts) already working
 * at the same store/date with overlapping times.
 */
function getCoworkersOnSlot(
  storeId: string,
  date: string,
  startTime: string,
  endTime: string,
  existingShifts: SolverExistingShift[],
  generatedShifts: SolverShift[],
  employees: SolverEmployee[],
): SolverEmployee[] {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const coworkerIds = new Set<string>();

  // Check existing shifts
  for (const s of existingShifts) {
    if (s.storeId !== storeId || s.date !== date || !s.employeeId) continue;
    const sStart = timeToMinutes(s.startTime);
    const sEnd = timeToMinutes(s.endTime);
    if (startMin < sEnd && sStart < endMin) {
      coworkerIds.add(s.employeeId);
    }
  }

  // Check generated shifts
  for (const s of generatedShifts) {
    if (s.storeId !== storeId || s.date !== date || !s.employeeId) continue;
    const sStart = timeToMinutes(s.startTime);
    const sEnd = timeToMinutes(s.endTime);
    if (startMin < sEnd && sStart < endMin) {
      coworkerIds.add(s.employeeId);
    }
  }

  return employees.filter((e) => coworkerIds.has(e.id));
}

/**
 * Generate a human-readable reason for assigning an employee to a slot.
 */
function generateAssignmentReason(
  employee: SolverEmployee,
  slotPhase: SlotPhase,
  storeImportance: number,
): string {
  const parts: string[] = [];

  if (slotPhase === "OUVERTURE" && employee.profileCategory === "A")
    parts.push("Profil A fiable pour l'ouverture");
  else if (slotPhase === "OUVERTURE")
    parts.push("Placé à l'ouverture");

  if (slotPhase === "FERMETURE" && employee.profileCategory === "A")
    parts.push("Profil A pour la fermeture");
  else if (slotPhase === "FERMETURE")
    parts.push("Placé à la fermeture");

  if (storeImportance === 1 && employee.profileCategory === "A")
    parts.push("Magasin prioritaire sécurisé");
  else if (storeImportance === 1)
    parts.push("Magasin prioritaire");

  if (slotPhase === "MILIEU" && employee.profileCategory === "C")
    parts.push("Profil faible orienté vers le milieu de journée");

  if (employee.profileCategory === "C")
    parts.push("Accompagné par un profil fort");

  return parts.join(" | ") || "Meilleur candidat disponible";
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

  const covered: TimeRange[] = existingShiftsForDay
    .map((s) => ({
      start: Math.max(openMin, timeToMinutes(s.startTime)),
      end: Math.min(closeMin, timeToMinutes(s.endTime)),
    }))
    .filter((r) => r.start < r.end)
    .sort((a, b) => a.start - b.start);

  const merged: TimeRange[] = [];
  for (const r of covered) {
    if (merged.length === 0 || r.start > merged[merged.length - 1].end) {
      merged.push({ ...r });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
    }
  }

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

    if (rangeHours < 1) continue;

    let segmentCount: number;
    if (idealRange) {
      const idealCenter = ((idealRange[0] + idealRange[1]) / 2) * 60;
      segmentCount = Math.max(1, Math.round(rangeMin / idealCenter));
      while (rangeMin / segmentCount > 8 * 60 && segmentCount < 10) {
        segmentCount++;
      }
    } else {
      segmentCount = Math.ceil(rangeMin / maxShiftMin);
    }

    if (segmentCount === 1) {
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
      const segmentDuration = Math.round(rangeMin / segmentCount);
      let prevEnd = range.start;
      for (let si = 0; si < segmentCount; si++) {
        const segStart = si === 0 ? range.start : prevEnd;
        const segEnd = si === segmentCount - 1 ? range.end : roundTo15(range.start + (si + 1) * segmentDuration);
        const clampedStart = Math.max(segStart, range.start);
        const clampedEnd = Math.min(segEnd, range.end);
        const segHours = (clampedEnd - clampedStart) / 60;
        prevEnd = clampedEnd;
        if (segHours < 0.5) continue;

        const breakMins = segHours > 6 ? 30 : 0;
        const label = si === 0 ? "matin" : si === segmentCount - 1 ? "après-midi" : "milieu";

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

  const existingForDay = existingShifts.filter(
    (s) => s.date === date && s.storeId === store.id
  );

  const uncoveredRanges = findUncoveredRanges(openMin, closeMin, existingForDay);
  const totalUncoveredHours = uncoveredRanges.reduce(
    (sum, r) => sum + (r.end - r.start) / 60, 0
  );

  if (totalUncoveredHours < 0.5) {
    return { slots: [], existingForDay };
  }

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
  storeMaxSimultaneous?: number,
  slotPhase?: SlotPhase,
  storeImportance?: number,
  coworkersOnSlot?: SolverEmployee[],
): SolverEmployee[] {
  const eligible: SolverEmployee[] = [];

  for (const emp of employees) {
    try {
      const state = employeeStates.get(emp.id);
      if (!state) continue;

      if (
        passesAllHardConstraints(
          emp, state, date, dayOfWeek, slot.startTime, slot.endTime, slot.hours,
          existingShifts, generatedShifts, storeOpenTime, storeCloseTime,
          storeId, storeMaxOverlapMinutes, storeMaxEmployees, storeMaxSimultaneous,
          slotPhase, storeImportance, coworkersOnSlot,
        )
      ) {
        eligible.push(emp);
      }
    } catch {
      continue;
    }
  }

  return eligible;
}

// ═══════════════════════════════════════════════════
// STEP 3 — SCORE & ASSIGN
// ═══════════════════════════════════════════════════

function scoreEmployeeForSlot(
  employee: SolverEmployee,
  state: EmployeeState,
  date: string,
  slotHours: number,
  storeId: string
): number {
  let score = 100;
  if (slotHours > 6) score -= 25;
  const dailyHours = state.dailyHours.get(date) || 0;
  if (dailyHours > 0) score -= 15;
  const target = employee.weeklyHours || 35;
  const afterAssignment = state.weeklyHoursAssigned + slotHours;
  if (target > 0 && afterAssignment > target) score -= 10;
  if (target > 0) {
    const remaining = target - state.weeklyHoursAssigned;
    if (remaining >= slotHours) score += 10;
  }
  if (employee.preferredStoreId === storeId) score += 5;
  if (employee.priority === 1) score += 5;
  return score;
}

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
  },
  slotPhase?: SlotPhase,
  storeImportance?: number,
): { employee: SolverEmployee; score: number } | null {
  if (eligible.length === 0) return null;

  const scored = eligible.map((emp) => {
    const state = employeeStates.get(emp.id)!;
    let score: number;

    if (weightedScoring) {
      score = calculateCandidateScore(
        emp, state, slot.hours, storeId,
        weightedScoring.minCost, weightedScoring.maxCost,
        weightedScoring.avgPoolHours, weightedScoring.weights,
        slotPhase, storeImportance,
      );
    } else {
      score = scoreEmployeeForSlot(emp, state, date, slot.hours, storeId);
    }

    return { employee: emp, score };
  });

  if (assignmentOrder === "fairness-first") {
    scored.sort((a, b) => {
      const aRemaining = (a.employee.weeklyHours || 35) - (employeeStates.get(a.employee.id)?.weeklyHoursAssigned || 0);
      const bRemaining = (b.employee.weeklyHours || 35) - (employeeStates.get(b.employee.id)?.weeklyHoursAssigned || 0);
      if (Math.abs(aRemaining - bRemaining) > 0.5) return bRemaining - aRemaining;
      return b.score - a.score;
    });
  } else {
    scored.sort((a, b) => b.score - a.score);
  }

  return scored[0];
}

// ═══════════════════════════════════════════════════
// STEP 4 — CREATE SHIFTS
// ═══════════════════════════════════════════════════

function createAssignedShift(
  employee: SolverEmployee,
  slot: CoverageSlot,
  store: SolverStore,
  date: string,
  state: EmployeeState,
  slotPhase: SlotPhase = "MILIEU",
  assignmentReason: string | null = null,
): { generated: GeneratedShift; raw: SolverShift } {
  const raw: SolverShift = {
    employeeId: employee.id,
    storeId: store.id,
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    hours: slot.hours,
  };

  updateState(state, raw);

  const warnings: string[] = [];
  if (employee.weeklyHours && state.weeklyHoursAssigned > employee.weeklyHours) {
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
    assignmentReason,
    slotPhase,
  };

  return { generated, raw };
}

function createUnassignedShift(
  slot: CoverageSlot,
  store: SolverStore,
  date: string,
  slotPhase: SlotPhase = "MILIEU",
): { generated: GeneratedShift; raw: SolverShift } {
  const raw: SolverShift = {
    employeeId: null,
    storeId: store.id,
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
    assignmentReason: null,
    slotPhase,
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
    states.set(emp.id, { weeklyHoursAssigned: 0, dailyHours: new Map(), shifts: [] });
  }

  for (const shift of existingShifts) {
    if (!shift.employeeId) continue;
    const state = states.get(shift.employeeId);
    if (!state) continue;

    const hours = calculateHoursFromTimes(shift.startTime, shift.endTime);
    state.weeklyHoursAssigned += hours;
    state.dailyHours.set(shift.date, (state.dailyHours.get(shift.date) || 0) + hours);
    state.shifts.push({ employeeId: shift.employeeId, storeId: shift.storeId, date: shift.date, startTime: shift.startTime, endTime: shift.endTime, hours });
  }

  return states;
}

function updateState(state: EmployeeState, shift: SolverShift): void {
  state.weeklyHoursAssigned += shift.hours;
  state.dailyHours.set(shift.date, (state.dailyHours.get(shift.date) || 0) + shift.hours);
  state.shifts.push(shift);
}

function computePoolStats(employees: SolverEmployee[]) {
  const costs = employees.map((e) => e.costPerHour).filter((c): c is number => c !== null);
  const minCost = costs.length > 0 ? Math.min(...costs) : 0;
  const maxCost = costs.length > 0 ? Math.max(...costs) : 0;
  const targets = employees.map((e) => e.weeklyHours).filter((h): h is number => h !== null && h > 0);
  const avgPoolHours = targets.length > 0 ? targets.reduce((a, b) => a + b, 0) / targets.length : 35;
  return { minCost, maxCost, avgPoolHours };
}

// ═══════════════════════════════════════════════════
// MAIN SOLVER
// ═══════════════════════════════════════════════════

export function solve(input: SolverInput, solveOptions: SolveOptions = {}): SolverResult {
  const startTime = performance.now();
  const { weights, assignmentOrder = "score-desc", useManagerBrain = true } = solveOptions;

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

  const effectiveWeights = weights ?? (useManagerBrain ? SCORING_PROFILES["manager-brain"] : undefined);
  const weightedScoring = effectiveWeights
    ? { weights: effectiveWeights, minCost: poolStats.minCost, maxCost: poolStats.maxCost, avgPoolHours: poolStats.avgPoolHours }
    : undefined;

  if (useManagerBrain) {
    // ─── MANAGER BRAIN MODE ───
    const allClassifiedSlots: ClassifiedSlot[] = [];
    const daySlotMap = new Map<string, { daySlot: DaySlot; existingForDay: SolverExistingShift[] }>();
    const slotsPerDay = new Map<string, number>();

    for (const daySlot of weekDays) {
      const { date, schedule } = daySlot;
      try {
        const { slots, existingForDay } = buildCoverageSlots(store, daySlot, existingShifts, options);
        daySlotMap.set(date, { daySlot, existingForDay });

        if (slots.length === 0) {
          daysFullyCovered++;
          slotsPerDay.set(date, 0);
          continue;
        }

        slotsPerDay.set(date, slots.length);

        if (!store.allowOverlap && schedule.minEmployees > 1) {
          warnings.push(`${date}: chevauchement interdit — couverture limitée à 1 employé par créneau (min demandé: ${schedule.minEmployees})`);
        }

        for (const slot of slots) {
          const phase = classifySlotPhase(slot.startTime, slot.endTime, schedule.openTime, schedule.closeTime);
          allClassifiedSlots.push({
            ...slot,
            phase,
            storeId: store.id,
            storeImportance: store.importance,
            date,
            dayOfWeek: daySlot.dayOfWeek,
            priority: computeSlotPriority(phase, store.importance),
          });
        }
      } catch (dayErr) {
        console.warn(`[Solver] Erreur jour ${daySlot.date}:`, dayErr);
        daysUncovered++;
        warnings.push(`${daySlot.date}: erreur interne — jour non planifié`);
      }
    }

    // Sort: all OUVERTUREs first, then FERMETUREs, then MILIEUs
    allClassifiedSlots.sort((a, b) => a.priority - b.priority);

    const filledPerDay = new Map<string, number>();

    for (const cs of allClassifiedSlots) {
      const { date, dayOfWeek, phase, storeImportance } = cs;
      const slot: CoverageSlot = { startTime: cs.startTime, endTime: cs.endTime, hours: cs.hours, breakMinutes: cs.breakMinutes, label: cs.label };

      const dayData = daySlotMap.get(date);
      if (!dayData) continue;
      const { daySlot } = dayData;
      const { schedule } = daySlot;
      const storeMaxOverlap = store.allowOverlap ? store.maxOverlapMinutes : 0;
      const storeMaxSimultaneous = schedule.maxSimultaneous ?? store.maxSimultaneous;

      try {
        const coworkers = getCoworkersOnSlot(store.id, date, slot.startTime, slot.endTime, existingShifts, allGeneratedRaw, employees);

        const eligible = getEligibleEmployees(
          employees, employeeStates, date, dayOfWeek, slot,
          existingShifts, allGeneratedRaw, schedule.openTime, schedule.closeTime,
          store.id, storeMaxOverlap, schedule.maxEmployees, storeMaxSimultaneous,
          phase, storeImportance, coworkers,
        );

        const best = assignBestEmployee(eligible, employeeStates, date, slot, store.id, assignmentOrder, weightedScoring, phase, storeImportance);

        if (best) {
          const reason = generateAssignmentReason(best.employee, phase, storeImportance);
          const state = employeeStates.get(best.employee.id)!;
          const { generated, raw } = createAssignedShift(best.employee, slot, store, date, state, phase, reason);
          allGeneratedRaw.push(raw);
          generatedShifts.push(generated);
          employeesUsedSet.add(best.employee.id);
          assignedCount++;
          filledPerDay.set(date, (filledPerDay.get(date) || 0) + 1);
        } else {
          warnings.push(`${date} (${slot.label} ${slot.startTime}-${slot.endTime}): aucun employé — shift non assigné`);
          const { generated, raw } = createUnassignedShift(slot, store, date, phase);
          allGeneratedRaw.push(raw);
          generatedShifts.push(generated);
          unassignedCount++;
        }
      } catch (slotErr) {
        console.warn(`[Solver] Erreur slot ${date} ${slot.startTime}-${slot.endTime}:`, slotErr);
        try {
          const { generated, raw } = createUnassignedShift(slot, store, date, phase);
          allGeneratedRaw.push(raw);
          generatedShifts.push(generated);
          unassignedCount++;
        } catch { /* last resort */ }
      }
    }

    // Coverage tracking
    for (const daySlot of weekDays) {
      const total = slotsPerDay.get(daySlot.date) || 0;
      if (total === 0) continue;
      const filled = filledPerDay.get(daySlot.date) || 0;
      if (filled >= total) daysFullyCovered++;
      else if (filled > 0) { daysPartiallyCovered++; warnings.push(`${daySlot.date}: couverture partielle (${filled}/${total} créneaux remplis)`); }
      else { daysUncovered++; warnings.push(`${daySlot.date}: aucun employé n'a pu être affecté`); }
    }

    // Manager check
    if (store.needsManager) {
      for (const daySlot of weekDays) {
        const { date } = daySlot;
        const dayData = daySlotMap.get(date);
        if (!dayData) continue;
        const { existingForDay } = dayData;

        const hasManager = existingForDay.some((s) => employees.find((e) => e.id === s.employeeId)?.skills.includes("MANAGER"))
          || generatedShifts.some((s) => s.date === date && employees.find((e) => e.id === s.employeeId)?.skills.includes("MANAGER"));

        if (!hasManager) {
          warnings.push(`${date}: aucun manager planifié (magasin requiert un manager)`);
        }
      }
    }
  } else {
    // ─── CLASSIC MODE ───
    for (const daySlot of weekDays) {
      const { date, dayOfWeek, schedule } = daySlot;
      try {
        const { slots, existingForDay } = buildCoverageSlots(store, daySlot, existingShifts, options);
        if (slots.length === 0) { daysFullyCovered++; continue; }
        if (!store.allowOverlap && schedule.minEmployees > 1) {
          warnings.push(`${date}: chevauchement interdit — couverture limitée à 1 employé par créneau (min demandé: ${schedule.minEmployees})`);
        }

        let filledThisDay = 0;
        const totalSlotsNeeded = slots.length;
        const storeMaxOverlap = store.allowOverlap ? store.maxOverlapMinutes : 0;
        const storeMaxSimultaneous = schedule.maxSimultaneous ?? store.maxSimultaneous;

        for (const slot of slots) {
          try {
            const eligible = getEligibleEmployees(employees, employeeStates, date, dayOfWeek, slot, existingShifts, allGeneratedRaw, schedule.openTime, schedule.closeTime, store.id, storeMaxOverlap, schedule.maxEmployees, storeMaxSimultaneous);
            const best = assignBestEmployee(eligible, employeeStates, date, slot, store.id, assignmentOrder, weightedScoring);

            if (best) {
              const state = employeeStates.get(best.employee.id)!;
              const { generated, raw } = createAssignedShift(best.employee, slot, store, date, state);
              allGeneratedRaw.push(raw);
              generatedShifts.push(generated);
              employeesUsedSet.add(best.employee.id);
              assignedCount++;
              filledThisDay++;
            } else {
              warnings.push(`${date} (${slot.label} ${slot.startTime}-${slot.endTime}): aucun employé — shift non assigné`);
              const { generated, raw } = createUnassignedShift(slot, store, date);
              allGeneratedRaw.push(raw);
              generatedShifts.push(generated);
              unassignedCount++;
            }
          } catch (slotErr) {
            console.warn(`[Solver] Erreur slot ${date} ${slot.startTime}-${slot.endTime}:`, slotErr);
            try {
              const { generated, raw } = createUnassignedShift(slot, store, date);
              allGeneratedRaw.push(raw);
              generatedShifts.push(generated);
              unassignedCount++;
            } catch { /* last resort */ }
          }
        }

        if (filledThisDay >= totalSlotsNeeded) daysFullyCovered++;
        else if (filledThisDay > 0) { daysPartiallyCovered++; warnings.push(`${date}: couverture partielle (${filledThisDay}/${totalSlotsNeeded} créneaux remplis)`); }
        else { daysUncovered++; warnings.push(`${date}: aucun employé n'a pu être affecté`); }

        if (store.needsManager) {
          const hasManager = existingForDay.some((s) => employees.find((e) => e.id === s.employeeId)?.skills.includes("MANAGER"))
            || generatedShifts.some((s) => s.date === date && employees.find((e) => e.id === s.employeeId)?.skills.includes("MANAGER"));
          if (!hasManager) warnings.push(`${date}: aucun manager planifié (magasin requiert un manager)`);
        }
      } catch (dayErr) {
        console.warn(`[Solver] Erreur jour ${daySlot.date}:`, dayErr);
        daysUncovered++;
        warnings.push(`${daySlot.date}: erreur interne — jour non planifié`);
      }
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

export function solveMultiStore(inputs: SolverInput[], solveOptions: SolveOptions = {}): SolverResult {
  const startTime = performance.now();
  const allShifts: GeneratedShift[] = [];
  const allWarnings: string[] = [];
  let totalDaysFullyCovered = 0, totalDaysPartiallyCovered = 0, totalDaysUncovered = 0;
  let totalAssigned = 0, totalUnassigned = 0;
  const allEmployeesUsed = new Set<string>();
  let cumulativeShifts: SolverExistingShift[] = [];

  for (const input of inputs) {
    try {
      const enrichedInput: SolverInput = { ...input, existingShifts: [...input.existingShifts, ...cumulativeShifts] };
      const result = solve(enrichedInput, solveOptions);

      allShifts.push(...result.shifts);
      allWarnings.push(...result.warnings.map((w) => `[${input.store.name}] ${w}`));
      totalDaysFullyCovered += result.stats.daysFullyCovered;
      totalDaysPartiallyCovered += result.stats.daysPartiallyCovered;
      totalDaysUncovered += result.stats.daysUncovered;
      totalAssigned += result.stats.assignedCount;
      totalUnassigned += result.stats.unassignedCount;
      for (const s of result.shifts) { if (s.employeeId) allEmployeesUsed.add(s.employeeId); }

      const newExisting: SolverExistingShift[] = result.shifts.map((s, i) => ({
        id: `gen-${input.store.id}-${i}`, employeeId: s.employeeId, storeId: s.storeId, date: s.date, startTime: s.startTime, endTime: s.endTime,
      }));
      cumulativeShifts = [...cumulativeShifts, ...newExisting];
    } catch (storeErr) {
      console.warn(`[Solver] Erreur store ${input.store.name}:`, storeErr);
      allWarnings.push(`[${input.store.name}] Erreur interne — magasin non planifié`);
    }
  }

  const solveTimeMs = performance.now() - startTime;
  const totalHours = allShifts.reduce((sum, s) => sum + s.hours, 0);

  return {
    shifts: allShifts, warnings: allWarnings,
    stats: { totalShiftsGenerated: allShifts.length, assignedCount: totalAssigned, unassignedCount: totalUnassigned, totalHoursGenerated: totalHours, daysFullyCovered: totalDaysFullyCovered, daysPartiallyCovered: totalDaysPartiallyCovered, daysUncovered: totalDaysUncovered, employeesUsed: allEmployeesUsed.size, solveTimeMs: Math.round(solveTimeMs * 100) / 100 },
  };
}

// ═══════════════════════════════════════════════════
// MULTI-SCENARIO SOLVER
// ═══════════════════════════════════════════════════

function emptyScenarioFallback(id: string, params: ScoredScenario["params"]): ScoredScenario {
  return {
    id, params,
    result: { shifts: [], warnings: ["Erreur interne"], stats: { totalShiftsGenerated: 0, assignedCount: 0, unassignedCount: 0, totalHoursGenerated: 0, daysFullyCovered: 0, daysPartiallyCovered: 0, daysUncovered: 0, employeesUsed: 0, solveTimeMs: 0 } },
    score: { total: 0, breakdown: { coverageCompleteness: 0, shiftDurationQuality: 0, employeeBalance: 0, constraintRespect: 0, costEfficiency: 0, breakQuality: 0, profilePlacementQuality: 0 }, label: "Insuffisant" },
  };
}

export function solveWithScenarios(input: SolverInput, config: ScenarioConfig = DEFAULT_SCENARIO_CONFIG, useManagerBrain: boolean = true): ScenarioResult {
  const startTime = performance.now();
  const allScenarios: ScoredScenario[] = [];

  function runScenario(durationHours: number, profileName: string, order: "score-desc" | "fairness-first"): ScoredScenario {
    const params = { shiftDurationHours: durationHours, scoringProfile: profileName, assignmentOrder: order };
    const id = `scenario-dur${durationHours}-${profileName}-${order}`;
    try {
      const weights = SCORING_PROFILES[profileName] || DEFAULT_WEIGHTS;
      const scenarioInput: SolverInput = { ...input, options: { ...input.options, shiftDurationHours: durationHours, idealShiftRange: config.idealShiftHours } };
      const result = solve(scenarioInput, { weights, assignmentOrder: order, useManagerBrain });
      const score = scoreScenario(result, input, config);
      return { id, params, result, score };
    } catch (err) {
      console.warn(`[Solver] Erreur scenario ${id}:`, err);
      return emptyScenarioFallback(id + "-error", params);
    }
  }

  for (const dur of config.durationsToTry) { allScenarios.push(runScenario(dur, "balanced", "score-desc")); }
  allScenarios.sort((a, b) => b.score.total - a.score.total);
  const topDurations = [...new Set(allScenarios.slice(0, 2).map((s) => s.params.shiftDurationHours))];
  const otherProfiles = Object.keys(SCORING_PROFILES).filter((p) => p !== "balanced");
  for (const dur of topDurations) { for (const profile of otherProfiles) { if (allScenarios.length >= config.maxScenarios) break; allScenarios.push(runScenario(dur, profile, "score-desc")); } }
  allScenarios.sort((a, b) => b.score.total - a.score.total);
  const topForFairness = allScenarios.slice(0, 3);
  for (const scenario of topForFairness) { if (allScenarios.length >= config.maxScenarios) break; allScenarios.push(runScenario(scenario.params.shiftDurationHours, scenario.params.scoringProfile, "fairness-first")); }
  allScenarios.sort((a, b) => b.score.total - a.score.total);

  if (allScenarios.length === 0) {
    const fallback = emptyScenarioFallback("no-scenarios", { shiftDurationHours: config.durationsToTry[0] || 7, scoringProfile: "balanced", assignmentOrder: "score-desc" });
    return { best: fallback, alternatives: [], suggestions: [], totalScenariosEvaluated: 0, totalTimeMs: Math.round((performance.now() - startTime) * 100) / 100 };
  }

  return { best: allScenarios[0], alternatives: allScenarios.slice(1, 4), suggestions: [], totalScenariosEvaluated: allScenarios.length, totalTimeMs: Math.round((performance.now() - startTime) * 100) / 100 };
}

export function solveMultiStoreWithScenarios(inputs: SolverInput[], config: ScenarioConfig = DEFAULT_SCENARIO_CONFIG, useManagerBrain: boolean = true): ScenarioResult {
  const startTime = performance.now();
  const allScenarios: ScoredScenario[] = [];

  function runScenario(durationHours: number, profileName: string, order: "score-desc" | "fairness-first"): ScoredScenario {
    const params = { shiftDurationHours: durationHours, scoringProfile: profileName, assignmentOrder: order };
    const id = `multi-scenario-dur${durationHours}-${profileName}-${order}`;
    try {
      const weights = SCORING_PROFILES[profileName] || DEFAULT_WEIGHTS;
      const scenarioInputs = inputs.map((input) => ({ ...input, options: { ...input.options, shiftDurationHours: durationHours, idealShiftRange: config.idealShiftHours as [number, number] } }));
      const result = solveMultiStore(scenarioInputs, { weights, assignmentOrder: order, useManagerBrain });
      const score = scoreScenario(result, inputs, config);
      return { id, params, result, score };
    } catch (err) {
      console.warn(`[Solver] Erreur multi-scenario ${id}:`, err);
      return emptyScenarioFallback(id + "-error", params);
    }
  }

  for (const dur of config.durationsToTry) { allScenarios.push(runScenario(dur, "balanced", "score-desc")); }
  allScenarios.sort((a, b) => b.score.total - a.score.total);
  const topDurations = [...new Set(allScenarios.slice(0, 2).map((s) => s.params.shiftDurationHours))];
  const otherProfiles = Object.keys(SCORING_PROFILES).filter((p) => p !== "balanced");
  for (const dur of topDurations) { for (const profile of otherProfiles) { if (allScenarios.length >= config.maxScenarios) break; allScenarios.push(runScenario(dur, profile, "score-desc")); } }
  allScenarios.sort((a, b) => b.score.total - a.score.total);
  const topForFairness = allScenarios.slice(0, 3);
  for (const scenario of topForFairness) { if (allScenarios.length >= config.maxScenarios) break; allScenarios.push(runScenario(scenario.params.shiftDurationHours, scenario.params.scoringProfile, "fairness-first")); }
  allScenarios.sort((a, b) => b.score.total - a.score.total);

  if (allScenarios.length === 0) {
    const fallback = emptyScenarioFallback("no-scenarios", { shiftDurationHours: config.durationsToTry[0] || 7, scoringProfile: "balanced", assignmentOrder: "score-desc" });
    return { best: fallback, alternatives: [], suggestions: [], totalScenariosEvaluated: 0, totalTimeMs: Math.round((performance.now() - startTime) * 100) / 100 };
  }

  return { best: allScenarios[0], alternatives: allScenarios.slice(1, 4), suggestions: [], totalScenariosEvaluated: allScenarios.length, totalTimeMs: Math.round((performance.now() - startTime) * 100) / 100 };
}

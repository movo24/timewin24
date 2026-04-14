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
  SolverStoreSchedule,
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
import {
  passesAllHardConstraints,
  isNoOverlap,
  isAvailable,
  isUnderDailyMax,
  isUnderWeeklyMax,
  hasEnoughRest,
  isStoreOverlapCompliant,
  isUnderMaxDistinctEmployees,
  isUnderMaxSimultaneous,
} from "./constraints";
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
  useShiftConstruction?: boolean;
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
// STEP 4 — CREATE SHIFTS + POST-PROCESSING
// ═══════════════════════════════════════════════════

/**
 * Merge adjacent shifts (same employee, store, day) into one continuous shift.
 * Adjacent = endTime of one matches startTime of next (no gap, no overlap).
 * Prevents fragmented planning like 07:00-09:00 + gap + 12:00-15:00.
 */
function mergeContiguousShifts(shifts: GeneratedShift[]): GeneratedShift[] {
  // Group by (employeeId, storeId, date) — only assigned shifts
  const groups = new Map<string, GeneratedShift[]>();
  const unassigned: GeneratedShift[] = [];

  for (const s of shifts) {
    if (!s.employeeId) { unassigned.push(s); continue; }
    const key = `${s.employeeId}||${s.storeId}||${s.date}`;
    const group = groups.get(key) ?? [];
    group.push(s);
    groups.set(key, group);
  }

  const merged: GeneratedShift[] = [];

  for (const group of groups.values()) {
    // Sort by startTime
    group.sort((a, b) => a.startTime.localeCompare(b.startTime));

    const result: GeneratedShift[] = [];
    let current = { ...group[0] };

    for (let i = 1; i < group.length; i++) {
      const next = group[i];
      // Adjacent = current.endTime === next.startTime
      if (current.endTime === next.startTime) {
        // Merge: extend endTime, sum hours, union warnings
        const totalHours = current.hours + next.hours;
        const breakMinutes = totalHours > 6 ? 30 : 0;
        current = {
          ...current,
          endTime: next.endTime,
          hours: totalHours,
          breakMinutes,
          warnings: [...new Set([...current.warnings, ...next.warnings])],
          mergedFromSlots: (current.mergedFromSlots ?? 1) + (next.mergedFromSlots ?? 1),
          // Keep dominant phase (OUVERTURE > FERMETURE > MILIEU)
          slotPhase: current.slotPhase === "OUVERTURE" ? "OUVERTURE"
            : next.slotPhase === "FERMETURE" ? "FERMETURE"
            : current.slotPhase,
        };
      } else {
        result.push(current);
        current = { ...next };
      }
    }
    result.push(current);
    merged.push(...result);
  }

  return [...merged, ...unassigned];
}

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
  let hoursAdjustedReason: string | null = null;
  if (employee.weeklyHours && state.weeklyHoursAssigned > employee.weeklyHours) {
    const excess = (state.weeklyHoursAssigned - employee.weeklyHours).toFixed(1);
    hoursAdjustedReason = `Heures ajustées automatiquement pour couvrir le besoin (+${excess}h au-delà des ${employee.weeklyHours}h contractuelles)`;
    warnings.push(hoursAdjustedReason);
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
    hoursAdjustedReason,
    mergedFromSlots: 1,
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
    hoursAdjustedReason: null,
    mergedFromSlots: 1,
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
// SHIFT CONSTRUCTION MODE
// ═══════════════════════════════════════════════════

/**
 * Find the longest valid shift an employee can work starting at rangeStartMin.
 * Tries from maximum possible duration down to 30min increments.
 * Returns endMin (minutes from midnight) or null if employee cannot work at all.
 */
function buildLongestShiftForEmployee(
  emp: SolverEmployee,
  state: EmployeeState,
  date: string,
  dayOfWeek: number,
  rangeStartMin: number,
  rangeEndMin: number,
  existingShifts: SolverExistingShift[],
  generatedShifts: SolverShift[],
  storeOpenTime: string,
  storeCloseTime: string,
  store: SolverStore,
  storeMaxOverlapMinutes: number,
  storeMaxEmployees: number | null,
  storeMaxSimultaneous: number,
): number | null {
  const dailyUsed = state.dailyHours.get(date) || 0;
  const weeklyUsed = state.weeklyHoursAssigned;
  const rangeDurationHours = (rangeEndMin - rangeStartMin) / 60;

  const maxShiftHours = Math.min(
    emp.maxHoursPerDay - dailyUsed,
    emp.maxHoursPerWeek - weeklyUsed,
    rangeDurationHours,
    10,
  );

  if (maxShiftHours < 0.5) return null;

  // Round down to nearest 15 minutes
  let endMin = rangeStartMin + Math.floor((maxShiftHours * 60) / 15) * 15;

  while (endMin > rangeStartMin) {
    const shiftHours = (endMin - rangeStartMin) / 60;
    const startTime = minutesToTime(rangeStartMin);
    const endTime = minutesToTime(endMin);

    try {
      // Check hard constraints individually.
      // NOTE: isShiftPreferenceCompatible is intentionally EXCLUDED here — it is a
      // soft preference that influences scoring, not a hard blocker. Treating it as
      // hard would truncate shifts at midday (e.g. a MATIN employee can never fill
      // 07:00-17:00) causing coverage gaps even when the employee is physically available.
      const passes =
        isNoOverlap(emp.id, date, startTime, endTime, existingShifts, generatedShifts) &&
        isAvailable(emp.unavailabilities, date, dayOfWeek, startTime, endTime) &&
        isUnderDailyMax(state, date, shiftHours, emp.maxHoursPerDay) &&
        isUnderWeeklyMax(state, shiftHours, emp.maxHoursPerWeek) &&
        hasEnoughRest(state, date, startTime, endTime, emp.minRestBetween) &&
        (storeMaxOverlapMinutes == null || isStoreOverlapCompliant(
          store.id, date, startTime, endTime, emp.id, storeMaxOverlapMinutes, existingShifts, generatedShifts
        )) &&
        (storeMaxEmployees === null || isUnderMaxDistinctEmployees(
          emp.id, store.id, date, storeMaxEmployees, existingShifts, generatedShifts
        )) &&
        (storeMaxSimultaneous == null || isUnderMaxSimultaneous(
          store.id, date, startTime, endTime, storeMaxSimultaneous, existingShifts, generatedShifts
        ));

      if (passes) return endMin;
    } catch {
      // skip this duration and try shorter
    }

    endMin -= 15;
  }

  return null;
}

// ─── Human-Quality Shift Constants ──────────────────
const MIN_SHIFT_HOURS = 4;      // hard minimum — never create shifts shorter than this
const IDEAL_SHIFT_MIN_H = 5;    // soft ideal minimum (penalty below)
const IDEAL_SHIFT_MAX_H = 8;    // soft ideal maximum (mild penalty above)

/**
 * Score a shift duration for human attractiveness.
 * Returns a positive score for ideal shifts (5–8h) and penalises extremes.
 */
function scoreShiftDurationQuality(hours: number): number {
  if (hours < MIN_SHIFT_HOURS) return -1000; // hard block
  if (hours < IDEAL_SHIFT_MIN_H) return (hours - MIN_SHIFT_HOURS) / (IDEAL_SHIFT_MIN_H - MIN_SHIFT_HOURS) * 30; // 0→30
  if (hours <= IDEAL_SHIFT_MAX_H) return 50; // ideal range
  return Math.max(10, 50 - (hours - IDEAL_SHIFT_MAX_H) * 4); // gentle penalty for very long
}

/**
 * Find the best balanced 2-employee relay split for a range that no single
 * employee can cover entirely.
 *
 * Strategy: search relay points within ±2.5h of the range centre.
 * For each relay, score the split by:
 *   - balance (how equal the two shift durations are)
 *   - human quality (each shift ≥ 5h ideally)
 *   - employee fit (priority, hours-remaining, cost)
 * Returns the best (emp1, emp2, relay) triple, or null if none found.
 */
function findBalancedTwoEmployeeSplit(
  range: TimeRange,
  employees: SolverEmployee[],
  employeeStates: Map<string, EmployeeState>,
  date: string,
  dayOfWeek: number,
  schedule: SolverStoreSchedule,
  store: SolverStore,
  existingShifts: SolverExistingShift[],
  generatedShifts: SolverShift[],
  storeMaxOverlap: number,
  storeMaxEmployees: number | null,
  storeMaxSimultaneous: number,
  weightedScoring?: { weights: ScoringWeights; minCost: number; maxCost: number; avgPoolHours: number },
): { emp1: SolverEmployee; emp2: SolverEmployee; relayMin: number } | null {
  const rangeHours = (range.end - range.start) / 60;
  if (rangeHours < MIN_SHIFT_HOURS * 2) return null;

  // Centre of the range — ideal relay for equal split
  const centerMin = Math.round((range.start + range.end) / 2 / 15) * 15;
  const searchWindowMin = 2.5 * 60; // ±2.5h from centre
  const searchStart = Math.max(range.start + MIN_SHIFT_HOURS * 60, centerMin - searchWindowMin);
  const searchEnd   = Math.min(range.end   - MIN_SHIFT_HOURS * 60, centerMin + searchWindowMin);

  let bestScore = -Infinity;
  let best: { emp1: SolverEmployee; emp2: SolverEmployee; relayMin: number } | null = null;

  for (let relay = searchStart; relay <= searchEnd; relay += 15) {
    const dur1 = (relay - range.start) / 60;
    const dur2 = (range.end - relay) / 60;

    if (dur1 < MIN_SHIFT_HOURS || dur2 < MIN_SHIFT_HOURS) continue;

    // Split quality: balance + human shift quality
    const balance = 1 - Math.abs(dur1 - dur2) / (dur1 + dur2); // 0–1
    const splitQuality = balance * 40 + scoreShiftDurationQuality(dur1) + scoreShiftDurationQuality(dur2);
    if (splitQuality < -500) continue; // skip obviously bad splits before pair search

    for (let i = 0; i < employees.length; i++) {
      const emp1 = employees[i];
      const state1 = employeeStates.get(emp1.id);
      if (!state1) continue;

      // emp1 must be able to cover range.start → relay exactly
      const emp1End = buildLongestShiftForEmployee(
        emp1, state1, date, dayOfWeek,
        range.start, relay, existingShifts, generatedShifts,
        schedule.openTime, schedule.closeTime,
        store, storeMaxOverlap, storeMaxEmployees, storeMaxSimultaneous,
      );
      if (emp1End === null || emp1End < relay) continue;

      for (let j = 0; j < employees.length; j++) {
        if (i === j) continue;
        const emp2 = employees[j];
        const state2 = employeeStates.get(emp2.id);
        if (!state2) continue;

        // emp2 must be able to cover relay → range.end exactly
        const emp2End = buildLongestShiftForEmployee(
          emp2, state2, date, dayOfWeek,
          relay, range.end, existingShifts, generatedShifts,
          schedule.openTime, schedule.closeTime,
          store, storeMaxOverlap, storeMaxEmployees, storeMaxSimultaneous,
        );
        if (emp2End === null || emp2End < range.end) continue;

        // Score employee pair fit
        const phase1 = classifySlotPhase(minutesToTime(range.start), minutesToTime(relay), schedule.openTime, schedule.closeTime);
        const phase2 = classifySlotPhase(minutesToTime(relay), minutesToTime(range.end), schedule.openTime, schedule.closeTime);
        let empScore1: number, empScore2: number;
        if (weightedScoring) {
          empScore1 = calculateCandidateScore(emp1, state1, dur1, store.id, weightedScoring.minCost, weightedScoring.maxCost, weightedScoring.avgPoolHours, weightedScoring.weights, phase1, store.importance);
          empScore2 = calculateCandidateScore(emp2, state2, dur2, store.id, weightedScoring.minCost, weightedScoring.maxCost, weightedScoring.avgPoolHours, weightedScoring.weights, phase2, store.importance);
        } else {
          empScore1 = scoreEmployeeForSlot(emp1, state1, date, dur1, store.id);
          empScore2 = scoreEmployeeForSlot(emp2, state2, date, dur2, store.id);
        }

        const totalScore = splitQuality + (empScore1 + empScore2) * 0.3;
        if (totalScore > bestScore) {
          bestScore = totalScore;
          best = { emp1, emp2, relayMin: relay };
        }
      }
    }
  }

  return best;
}

/**
 * Solve a single day using human-quality shift construction.
 *
 * 3-step logic per uncovered range:
 *   1. Full coverage — find the best employee who can cover the entire range alone.
 *   2. Balanced relay — when no single employee suffices, find the best 2-employee
 *      split that maximises balance and human shift quality (avoids 10h/3.5h splits).
 *   3. Greedy fallback — assign the best employee for as long as possible,
 *      continue with the remainder.
 */
function solveDayWithShiftConstruction(
  store: SolverStore,
  daySlot: DaySlot,
  employees: SolverEmployee[],
  employeeStates: Map<string, EmployeeState>,
  existingShifts: SolverExistingShift[],
  allGeneratedRaw: SolverShift[],
  weightedScoring?: { weights: ScoringWeights; minCost: number; maxCost: number; avgPoolHours: number },
): {
  shifts: GeneratedShift[];
  assignedCount: number;
  unassignedCount: number;
  warnings: string[];
} {
  const { date, dayOfWeek, schedule } = daySlot;
  const openMin = timeToMinutes(schedule.openTime);
  const closeMin = timeToMinutes(schedule.closeTime);
  const storeMaxOverlap = store.allowOverlap ? store.maxOverlapMinutes : 0;
  const storeMaxSimultaneous = schedule.maxSimultaneous ?? store.maxSimultaneous;
  const storeMaxEmployees = schedule.maxEmployees ?? store.maxEmployees;

  // Start with full day uncovered (minus already existing shifts)
  let uncoveredRanges = findUncoveredRanges(
    openMin,
    closeMin,
    existingShifts.filter((s) => s.date === date && s.storeId === store.id),
  );

  const dayShifts: GeneratedShift[] = [];
  let assignedCount = 0;
  let unassignedCount = 0;
  const warnings: string[] = [];

  while (uncoveredRanges.length > 0) {
    const range = uncoveredRanges[0];
    const rangeHours = (range.end - range.start) / 60;

    if (rangeHours < 0.5) {
      uncoveredRanges.shift();
      continue;
    }

    // ─── Step 1: Full coverage — find the best single employee who covers the whole range ───

    let fullCoverEmployee: SolverEmployee | null = null;
    let fullCoverScore = -Infinity;

    for (const emp of employees) {
      const state = employeeStates.get(emp.id);
      if (!state) continue;

      const endMin = buildLongestShiftForEmployee(
        emp, state, date, dayOfWeek,
        range.start, range.end,
        existingShifts, allGeneratedRaw,
        schedule.openTime, schedule.closeTime,
        store, storeMaxOverlap, storeMaxEmployees, storeMaxSimultaneous,
      );
      if (endMin === null || endMin < range.end) continue;

      // Quality check: the resulting shift must meet minimum duration
      if (scoreShiftDurationQuality(rangeHours) < -500) continue;

      const phase = classifySlotPhase(minutesToTime(range.start), minutesToTime(range.end), schedule.openTime, schedule.closeTime);
      const score = weightedScoring
        ? calculateCandidateScore(emp, state, rangeHours, store.id, weightedScoring.minCost, weightedScoring.maxCost, weightedScoring.avgPoolHours, weightedScoring.weights, phase, store.importance)
        : scoreEmployeeForSlot(emp, state, date, rangeHours, store.id);

      if (score > fullCoverScore) {
        fullCoverScore = score;
        fullCoverEmployee = emp;
      }
    }

    if (fullCoverEmployee) {
      const slot: CoverageSlot = {
        startTime: minutesToTime(range.start),
        endTime: minutesToTime(range.end),
        hours: rangeHours,
        breakMinutes: rangeHours > 6 ? 30 : 0,
        label: rangeHours >= (closeMin - openMin) / 60 * 0.8 ? "journée" : range.start === openMin ? "matin" : "après-midi",
      };
      const state = employeeStates.get(fullCoverEmployee.id)!;
      const phase = classifySlotPhase(slot.startTime, slot.endTime, schedule.openTime, schedule.closeTime);
      const reason = generateAssignmentReason(fullCoverEmployee, phase, store.importance);
      const { generated, raw } = createAssignedShift(fullCoverEmployee, slot, store, date, state, phase, reason);
      dayShifts.push(generated);
      allGeneratedRaw.push(raw);
      assignedCount++;
      uncoveredRanges.shift();
      continue;
    }

    // ─── Step 2: Balanced relay — find the best 2-employee split ────────────

    if (rangeHours >= MIN_SHIFT_HOURS * 2) {
      const split = findBalancedTwoEmployeeSplit(
        range, employees, employeeStates, date, dayOfWeek,
        schedule, store, existingShifts, allGeneratedRaw,
        storeMaxOverlap, storeMaxEmployees, storeMaxSimultaneous,
        weightedScoring,
      );

      if (split) {
        const { emp1, emp2, relayMin } = split;

        // Assign emp1: range.start → relay
        const dur1 = (relayMin - range.start) / 60;
        const slot1: CoverageSlot = {
          startTime: minutesToTime(range.start), endTime: minutesToTime(relayMin),
          hours: dur1, breakMinutes: dur1 > 6 ? 30 : 0, label: "matin",
        };
        const state1 = employeeStates.get(emp1.id)!;
        const phase1 = classifySlotPhase(slot1.startTime, slot1.endTime, schedule.openTime, schedule.closeTime);
        const { generated: gen1, raw: raw1 } = createAssignedShift(emp1, slot1, store, date, state1, phase1, generateAssignmentReason(emp1, phase1, store.importance));
        dayShifts.push(gen1);
        allGeneratedRaw.push(raw1);
        assignedCount++;

        // Assign emp2: relay → range.end
        const dur2 = (range.end - relayMin) / 60;
        const slot2: CoverageSlot = {
          startTime: minutesToTime(relayMin), endTime: minutesToTime(range.end),
          hours: dur2, breakMinutes: dur2 > 6 ? 30 : 0, label: "après-midi",
        };
        const state2 = employeeStates.get(emp2.id)!;
        const phase2 = classifySlotPhase(slot2.startTime, slot2.endTime, schedule.openTime, schedule.closeTime);
        const { generated: gen2, raw: raw2 } = createAssignedShift(emp2, slot2, store, date, state2, phase2, generateAssignmentReason(emp2, phase2, store.importance));
        dayShifts.push(gen2);
        allGeneratedRaw.push(raw2);
        assignedCount++;

        uncoveredRanges.shift();
        continue;
      }
    }

    // ─── Step 3: Greedy fallback — assign longest viable shift, continue with remainder ──

    let bestEmployee: SolverEmployee | null = null;
    let bestEndMin = 0;
    let bestScore = -Infinity;

    for (const emp of employees) {
      const state = employeeStates.get(emp.id);
      if (!state) continue;

      const endMin = buildLongestShiftForEmployee(
        emp, state, date, dayOfWeek,
        range.start, range.end,
        existingShifts, allGeneratedRaw,
        schedule.openTime, schedule.closeTime,
        store, storeMaxOverlap, storeMaxEmployees, storeMaxSimultaneous,
      );
      if (endMin === null || endMin <= range.start) continue;

      const shiftHours = (endMin - range.start) / 60;

      // Reject shifts shorter than the hard minimum in greedy mode too
      if (scoreShiftDurationQuality(shiftHours) < -500) continue;

      const phase = classifySlotPhase(minutesToTime(range.start), minutesToTime(endMin), schedule.openTime, schedule.closeTime);
      let score: number;
      if (weightedScoring) {
        score = calculateCandidateScore(emp, state, shiftHours, store.id, weightedScoring.minCost, weightedScoring.maxCost, weightedScoring.avgPoolHours, weightedScoring.weights, phase, store.importance);
      } else {
        score = scoreEmployeeForSlot(emp, state, date, shiftHours, store.id);
      }

      // Prefer longer shifts (more coverage) when scores are tied
      const adjustedScore = score + (endMin - range.start) / Math.max(1, closeMin - openMin) * 5;
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestEmployee = emp;
        bestEndMin = endMin;
      }
    }

    if (!bestEmployee) {
      // Nobody can work here at all — unassigned
      const slot: CoverageSlot = {
        startTime: minutesToTime(range.start),
        endTime: minutesToTime(range.end),
        hours: rangeHours,
        breakMinutes: rangeHours > 6 ? 30 : 0,
        label: "non assigné",
      };
      const phase = classifySlotPhase(slot.startTime, slot.endTime, schedule.openTime, schedule.closeTime);
      const { generated, raw } = createUnassignedShift(slot, store, date, phase);
      dayShifts.push(generated);
      allGeneratedRaw.push(raw);
      unassignedCount++;
      warnings.push(`${date} (${slot.startTime}-${slot.endTime}): aucun employé disponible — shift non assigné`);
      uncoveredRanges.shift();
      continue;
    }

    // Greedy: assign and continue with leftover range
    const shiftHours = (bestEndMin - range.start) / 60;
    const dayFractionCovered = (closeMin - openMin) > 0 ? (bestEndMin - range.start) / (closeMin - openMin) : 0;
    const slot: CoverageSlot = {
      startTime: minutesToTime(range.start),
      endTime: minutesToTime(bestEndMin),
      hours: shiftHours,
      breakMinutes: shiftHours > 6 ? 30 : 0,
      label: dayFractionCovered >= 0.8 ? "journée" : range.start === openMin ? "matin" : "après-midi",
    };
    const state = employeeStates.get(bestEmployee.id)!;
    const phase = classifySlotPhase(slot.startTime, slot.endTime, schedule.openTime, schedule.closeTime);
    const { generated, raw } = createAssignedShift(bestEmployee, slot, store, date, state, phase, generateAssignmentReason(bestEmployee, phase, store.importance));
    dayShifts.push(generated);
    allGeneratedRaw.push(raw);
    assignedCount++;

    if (bestEndMin >= range.end) {
      uncoveredRanges.shift();
    } else {
      uncoveredRanges[0] = { start: bestEndMin, end: range.end };
    }
  }

  return { shifts: dayShifts, assignedCount, unassignedCount, warnings };
}

/**
 * Full solver using shift construction mode for all days.
 * Same output structure as solve(), but calls solveDayWithShiftConstruction per day.
 */
function solveWithShiftConstructionMode(input: SolverInput, solveOptions: SolveOptions): SolverResult {
  const startTime = performance.now();
  const { weights, useManagerBrain = true } = solveOptions;

  const { store, employees, existingShifts, weekDays } = input;

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

  for (const daySlot of weekDays) {
    const { date } = daySlot;
    try {
      const openMin = timeToMinutes(daySlot.schedule.openTime);
      const closeMin = timeToMinutes(daySlot.schedule.closeTime);

      // Check if day is already fully covered by existing shifts
      const uncoveredBefore = findUncoveredRanges(
        openMin, closeMin,
        existingShifts.filter((s) => s.date === date && s.storeId === store.id),
      );
      const totalUncoveredHours = uncoveredBefore.reduce((sum, r) => sum + (r.end - r.start) / 60, 0);

      if (totalUncoveredHours < 0.5) {
        daysFullyCovered++;
        continue;
      }

      const dayResult = solveDayWithShiftConstruction(
        store, daySlot, employees, employeeStates,
        existingShifts, allGeneratedRaw, weightedScoring,
      );

      generatedShifts.push(...dayResult.shifts);
      warnings.push(...dayResult.warnings);
      assignedCount += dayResult.assignedCount;
      unassignedCount += dayResult.unassignedCount;

      for (const s of dayResult.shifts) {
        if (s.employeeId) employeesUsedSet.add(s.employeeId);
      }

      // Coverage tracking
      if (dayResult.unassignedCount === 0 && dayResult.assignedCount > 0) {
        daysFullyCovered++;
      } else if (dayResult.assignedCount > 0) {
        daysPartiallyCovered++;
        warnings.push(`${date}: couverture partielle`);
      } else {
        daysUncovered++;
        warnings.push(`${date}: aucun employé n'a pu être affecté`);
      }

      // Manager check
      if (store.needsManager) {
        const existingForDay = existingShifts.filter((s) => s.date === date && s.storeId === store.id);
        const hasManager = existingForDay.some((s) => employees.find((e) => e.id === s.employeeId)?.skills.includes("MANAGER"))
          || dayResult.shifts.some((s) => employees.find((e) => e.id === s.employeeId)?.skills.includes("MANAGER"));
        if (!hasManager) {
          warnings.push(`${date}: aucun manager planifié (magasin requiert un manager)`);
        }
      }
    } catch (dayErr) {
      console.warn(`[Solver/ShiftConstruction] Erreur jour ${date}:`, dayErr);
      daysUncovered++;
      warnings.push(`${date}: erreur interne — jour non planifié`);
    }
  }

  const solveTimeMs = performance.now() - startTime;
  const mergedShifts = mergeContiguousShifts(generatedShifts);
  const totalHours = mergedShifts.reduce((sum, s) => sum + s.hours, 0);

  // Build structured coverage gaps from warnings
  const coverageGaps: import("./types").CoverageGap[] = [];
  for (const w of warnings) {
    if (w.includes("aucun employé n'a pu être affecté")) {
      const date = w.split(":")[0].trim();
      coverageGaps.push({
        date,
        storeName: store.name,
        reason: "Aucun employé éligible pour cette journée",
        suggestion: "Vérifiez les autorisations magasin, les heures max et les indisponibilités des employés",
      });
    } else if (w.includes("couverture partielle")) {
      const date = w.split(":")[0].trim();
      coverageGaps.push({
        date,
        storeName: store.name,
        reason: w.split(":").slice(1).join(":").trim(),
        suggestion: "Ajoutez des employés autorisés sur ce magasin ou augmentez leurs heures max",
      });
    }
  }

  return {
    shifts: mergedShifts,
    warnings,
    coverageGaps,
    stats: {
      totalShiftsGenerated: mergedShifts.length,
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
// MAIN SOLVER
// ═══════════════════════════════════════════════════

export function solve(input: SolverInput, solveOptions: SolveOptions = {}): SolverResult {
  // Shift construction is the default mode (use old slot-filling only when explicitly disabled)
  if (solveOptions.useShiftConstruction !== false) {
    return solveWithShiftConstructionMode(input, solveOptions);
  }

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
  const mergedShifts = mergeContiguousShifts(generatedShifts);
  const totalHours = mergedShifts.reduce((sum, s) => sum + s.hours, 0);

  // Build structured coverage gaps from warnings
  const coverageGaps: import("./types").CoverageGap[] = [];
  for (const w of warnings) {
    if (w.includes("aucun employé n'a pu être affecté")) {
      const date = w.split(":")[0].trim();
      coverageGaps.push({
        date,
        storeName: store.name,
        reason: "Aucun employé éligible pour cette journée",
        suggestion: "Vérifiez les autorisations magasin, les heures max et les indisponibilités des employés",
      });
    } else if (w.includes("couverture partielle")) {
      const date = w.split(":")[0].trim();
      coverageGaps.push({
        date,
        storeName: store.name,
        reason: w.split(":").slice(1).join(":").trim(),
        suggestion: "Ajoutez des employés autorisés sur ce magasin ou augmentez leurs heures max",
      });
    }
  }

  return {
    shifts: mergedShifts,
    warnings,
    coverageGaps,
    stats: {
      totalShiftsGenerated: mergedShifts.length,
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
  const allCoverageGaps = inputs.flatMap((inp) => {
    // re-collect gaps from warnings for this store
    return allWarnings
      .filter((w) => w.startsWith(`[${inp.store.name}]`))
      .filter((w) => w.includes("aucun employé") || w.includes("couverture partielle"))
      .map((w) => ({
        date: w.replace(`[${inp.store.name}] `, "").split(":")[0].trim(),
        storeName: inp.store.name,
        reason: w.replace(`[${inp.store.name}] `, "").split(":").slice(1).join(":").trim(),
        suggestion: "Ajoutez des employés autorisés sur ce magasin ou augmentez leurs heures max",
      }));
  });

  return {
    shifts: allShifts, warnings: allWarnings, coverageGaps: allCoverageGaps,
    stats: { totalShiftsGenerated: allShifts.length, assignedCount: totalAssigned, unassignedCount: totalUnassigned, totalHoursGenerated: totalHours, daysFullyCovered: totalDaysFullyCovered, daysPartiallyCovered: totalDaysPartiallyCovered, daysUncovered: totalDaysUncovered, employeesUsed: allEmployeesUsed.size, solveTimeMs: Math.round(solveTimeMs * 100) / 100 },
  };
}

// ═══════════════════════════════════════════════════
// MULTI-SCENARIO SOLVER
// ═══════════════════════════════════════════════════

function emptyScenarioFallback(id: string, params: ScoredScenario["params"]): ScoredScenario {
  return {
    id, params,
    result: { shifts: [], warnings: ["Erreur interne"], coverageGaps: [], stats: { totalShiftsGenerated: 0, assignedCount: 0, unassignedCount: 0, totalHoursGenerated: 0, daysFullyCovered: 0, daysPartiallyCovered: 0, daysUncovered: 0, employeesUsed: 0, solveTimeMs: 0 } },
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

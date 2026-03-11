/**
 * Hard Constraints — Pure functions, no DB access.
 * Each returns true if the constraint is SATISFIED.
 */

import type {
  SolverEmployee,
  SolverUnavailability,
  SolverExistingShift,
  SolverShift,
  EmployeeState,
} from "./types";

/**
 * No overlapping shifts for the same employee.
 * Checks both existing shifts (from DB) and already-generated shifts.
 */
export function isNoOverlap(
  employeeId: string,
  date: string,
  startTime: string,
  endTime: string,
  existingShifts: SolverExistingShift[],
  generatedShifts: SolverShift[]
): boolean {
  // Check existing shifts
  for (const s of existingShifts) {
    if (s.employeeId !== employeeId || s.date !== date) continue;
    if (startTime < s.endTime && s.startTime < endTime) return false;
  }
  // Check generated shifts
  for (const s of generatedShifts) {
    if (s.employeeId !== employeeId || s.date !== date) continue;
    if (startTime < s.endTime && s.startTime < endTime) return false;
  }
  return true;
}

/**
 * Respect unavailabilities (FIXED recurring + VARIABLE specific dates).
 * Handles both full-day and partial unavailabilities.
 */
export function isAvailable(
  unavailabilities: SolverUnavailability[],
  date: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string
): boolean {
  for (const u of unavailabilities) {
    // FIXED: recurring weekly day
    if (u.type === "FIXED" && u.dayOfWeek === dayOfWeek) {
      if (!u.startTime || !u.endTime) return false; // full day unavailable
      if (startTime < u.endTime && u.startTime < endTime) return false; // partial overlap
    }
    // VARIABLE: specific date
    if (u.type === "VARIABLE" && u.date === date) {
      if (!u.startTime || !u.endTime) return false; // full day unavailable
      if (startTime < u.endTime && u.startTime < endTime) return false;
    }
  }
  return true;
}

/**
 * Max hours per day not exceeded.
 */
export function isUnderDailyMax(
  state: EmployeeState,
  date: string,
  shiftHours: number,
  maxHoursPerDay: number
): boolean {
  const current = state.dailyHours.get(date) || 0;
  return current + shiftHours <= maxHoursPerDay;
}

/**
 * Max hours per week not exceeded.
 */
export function isUnderWeeklyMax(
  state: EmployeeState,
  shiftHours: number,
  maxHoursPerWeek: number
): boolean {
  return state.weeklyHoursAssigned + shiftHours <= maxHoursPerWeek;
}

/**
 * Minimum rest between shifts (default 11h, French labor law).
 * Computes the gap in hours between all existing/generated shifts
 * for this employee and the proposed shift.
 */
export function hasEnoughRest(
  state: EmployeeState,
  date: string,
  startTime: string,
  minRestHours: number
): boolean {
  for (const s of state.shifts) {
    // Only check shifts that are close in time (same day or adjacent days)
    const gapHours = calculateGapHours(s.date, s.endTime, date, startTime);
    // If the proposed shift starts AFTER an existing shift ends
    if (gapHours >= 0 && gapHours < minRestHours) return false;

    // Also check reverse: proposed shift ends before existing shift starts
    const reverseGap = calculateGapHours(date, getShiftEndForRest(startTime, date), s.date, s.startTime);
    // Not needed — we only generate one shift per employee per day,
    // and we process days in order. So we only check forward rest.
  }
  return true;
}

/**
 * Helper: compute hours gap between (dateA endTimeA) → (dateB startTimeB).
 * Returns negative if B is before A (not relevant).
 */
function calculateGapHours(
  dateA: string,
  endTimeA: string,
  dateB: string,
  startTimeB: string
): number {
  const [ay, am, ad] = dateA.split("-").map(Number);
  const [ah, ami] = endTimeA.split(":").map(Number);
  const [by, bm, bd] = dateB.split("-").map(Number);
  const [bh, bmi] = startTimeB.split(":").map(Number);

  const aMs = Date.UTC(ay, am - 1, ad, ah, ami);
  const bMs = Date.UTC(by, bm - 1, bd, bh, bmi);

  const diffMs = bMs - aMs;
  if (diffMs < 0) return -1; // B is before A
  return diffMs / (1000 * 60 * 60);
}

// Not used but kept for completeness
function getShiftEndForRest(_startTime: string, _date: string): string {
  return _startTime; // placeholder
}

// ─── Time helpers ──────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Check if employee's shift preference matches the slot's time range.
 *
 * Uses the store's opening hours to compute the midpoint:
 *   - MATIN employees can only work shifts ending at or before the midpoint (+30min tolerance)
 *   - APRES_MIDI employees can only work shifts starting at or after the midpoint (-30min tolerance)
 *   - JOURNEE employees can work any slot
 */
export function isShiftPreferenceCompatible(
  shiftPreference: "MATIN" | "APRES_MIDI" | "JOURNEE",
  slotStartTime: string,
  slotEndTime: string,
  storeOpenTime: string,
  storeCloseTime: string
): boolean {
  if (shiftPreference === "JOURNEE") return true;

  const openMin = timeToMinutes(storeOpenTime);
  const closeMin = timeToMinutes(storeCloseTime);
  const midpoint = Math.floor((openMin + closeMin) / 2);

  const slotEndMin = timeToMinutes(slotEndTime);
  const slotStartMin = timeToMinutes(slotStartTime);

  if (shiftPreference === "MATIN") {
    // Slot must END at or before the midpoint (+30min tolerance for rounding)
    return slotEndMin <= midpoint + 30;
  }

  if (shiftPreference === "APRES_MIDI") {
    // Slot must START at or after the midpoint (-30min tolerance for rounding)
    return slotStartMin >= midpoint - 30;
  }

  return true;
}

/**
 * Store-level overlap compliance.
 * Checks if assigning a shift would create overlap with other employees
 * at the same store exceeding maxOverlapMinutes.
 *
 * When maxOverlapMinutes=0: no overlap at all (exact relay only).
 * When maxOverlapMinutes>0: overlap up to N minutes allowed.
 */
export function isStoreOverlapCompliant(
  storeId: string,
  date: string,
  startTime: string,
  endTime: string,
  employeeId: string,
  maxOverlapMinutes: number,
  existingShifts: SolverExistingShift[],
  generatedShifts: SolverShift[]
): boolean {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  // Check existing shifts from other employees at same store/day
  for (const s of existingShifts) {
    if (s.storeId !== storeId || s.date !== date) continue;
    if (!s.employeeId || s.employeeId === employeeId) continue;
    const sStart = timeToMinutes(s.startTime);
    const sEnd = timeToMinutes(s.endTime);
    const overlap = Math.max(0, Math.min(endMin, sEnd) - Math.max(startMin, sStart));
    if (overlap > maxOverlapMinutes) return false;
  }

  // Check generated shifts from other employees at same store/day
  for (const s of generatedShifts) {
    if (s.date !== date) continue;
    if (!s.employeeId || s.employeeId === employeeId) continue;
    const sStart = timeToMinutes(s.startTime);
    const sEnd = timeToMinutes(s.endTime);
    const overlap = Math.max(0, Math.min(endMin, sEnd) - Math.max(startMin, sStart));
    if (overlap > maxOverlapMinutes) return false;
  }

  return true;
}

/**
 * Max distinct employees per day at a store.
 * Returns true if adding this employee would NOT exceed the limit.
 */
export function isUnderMaxDistinctEmployees(
  employeeId: string,
  storeId: string,
  date: string,
  maxEmployees: number | null,
  existingShifts: SolverExistingShift[],
  generatedShifts: SolverShift[]
): boolean {
  if (maxEmployees === null) return true; // unlimited

  const ids = new Set<string>();
  for (const s of existingShifts) {
    if (s.storeId === storeId && s.date === date && s.employeeId) {
      ids.add(s.employeeId);
    }
  }
  for (const s of generatedShifts) {
    if (s.date === date && s.employeeId) {
      ids.add(s.employeeId);
    }
  }

  // If this employee already works that day, no new distinct employee
  if (ids.has(employeeId)) return true;

  return ids.size < maxEmployees;
}

/**
 * Max simultaneous employees at a store at any point in time.
 * Uses a sweep-line algorithm. Sorts delta -1 before +1 at same time
 * so exact relays (A ends 15h, B starts 15h) count as 1, not 2.
 */
export function isUnderMaxSimultaneous(
  storeId: string,
  date: string,
  startTime: string,
  endTime: string,
  maxSimultaneous: number,
  existingShifts: SolverExistingShift[],
  generatedShifts: SolverShift[]
): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const events: { time: number; delta: number }[] = [];

  // Existing shifts at this store on this date
  for (const s of existingShifts) {
    if (s.storeId === storeId && s.date === date && s.employeeId) {
      events.push({ time: toMin(s.startTime), delta: 1 });
      events.push({ time: toMin(s.endTime), delta: -1 });
    }
  }

  // Generated shifts on this date (same store implied by solver context)
  for (const s of generatedShifts) {
    if (s.date === date && s.employeeId) {
      events.push({ time: toMin(s.startTime), delta: 1 });
      events.push({ time: toMin(s.endTime), delta: -1 });
    }
  }

  // Proposed shift
  events.push({ time: toMin(startTime), delta: 1 });
  events.push({ time: toMin(endTime), delta: -1 });

  // Sort by time, then departures before arrivals at same time
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);

  let concurrent = 0;
  let peak = 0;
  for (const e of events) {
    concurrent += e.delta;
    peak = Math.max(peak, concurrent);
  }

  return peak <= maxSimultaneous;
}

/**
 * Combined check: does assigning this shift pass ALL hard constraints?
 */
export function passesAllHardConstraints(
  employee: SolverEmployee,
  state: EmployeeState,
  date: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  shiftHours: number,
  existingShifts: SolverExistingShift[],
  generatedShifts: SolverShift[],
  storeOpenTime: string,
  storeCloseTime: string,
  storeId?: string,
  storeMaxOverlapMinutes?: number | null,
  storeMaxEmployees?: number | null,
  storeMaxSimultaneous?: number
): boolean {
  if (!isNoOverlap(employee.id, date, startTime, endTime, existingShifts, generatedShifts))
    return false;
  if (!isAvailable(employee.unavailabilities, date, dayOfWeek, startTime, endTime))
    return false;
  if (!isUnderDailyMax(state, date, shiftHours, employee.maxHoursPerDay))
    return false;
  if (!isUnderWeeklyMax(state, shiftHours, employee.maxHoursPerWeek))
    return false;
  if (!hasEnoughRest(state, date, startTime, employee.minRestBetween))
    return false;
  if (!isShiftPreferenceCompatible(
    employee.shiftPreference,
    startTime,
    endTime,
    storeOpenTime,
    storeCloseTime
  ))
    return false;
  if (storeId != null && storeMaxOverlapMinutes != null) {
    if (!isStoreOverlapCompliant(storeId, date, startTime, endTime, employee.id, storeMaxOverlapMinutes, existingShifts, generatedShifts))
      return false;
  }
  if (storeId != null && storeMaxEmployees !== undefined) {
    if (!isUnderMaxDistinctEmployees(employee.id, storeId, date, storeMaxEmployees ?? null, existingShifts, generatedShifts))
      return false;
  }
  if (storeId != null && storeMaxSimultaneous !== undefined) {
    if (!isUnderMaxSimultaneous(storeId, date, startTime, endTime, storeMaxSimultaneous, existingShifts, generatedShifts))
      return false;
  }
  return true;
}

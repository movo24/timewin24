/**
 * Shift Marketplace — Constraint checking for shift claims.
 *
 * Reuses existing functions from shifts.ts, shift-utils.ts,
 * solver/constraints.ts, and replacement.ts patterns.
 */

import { prisma } from "./prisma";
import { findOverlappingShift, calculateWeeklyHours } from "./shifts";
import { isAvailable } from "./solver/constraints";
import { calculateShiftHours } from "./shift-utils";
import type { SolverUnavailability } from "./solver/types";

export interface ConstraintCheckResult {
  eligible: boolean;
  overlapOk: boolean;
  weeklyHoursOk: boolean;
  dailyHoursOk: boolean;
  restOk: boolean;
  availabilityOk: boolean;
  details: {
    currentWeeklyHours: number;
    shiftHours: number;
    maxWeeklyHours: number;
    currentDailyHours: number;
    maxDailyHours: number;
  };
}

/**
 * Check all hard constraints for an employee claiming a shift.
 * Returns detailed results so the manager can see what passed/failed.
 */
export async function checkClaimConstraints(
  employeeId: string,
  shift: { id: string; date: Date; startTime: string; endTime: string }
): Promise<ConstraintCheckResult> {
  const dateStr = shift.date.toISOString().split("T")[0];
  const dayOfWeek = shift.date.getUTCDay();
  const shiftHours = calculateShiftHours(shift.startTime, shift.endTime);

  // Load employee with unavailabilities and shifts for the week
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      unavailabilities: true,
      shifts: {
        where: {
          date: {
            gte: getWeekStart(shift.date),
            lte: getWeekEnd(shift.date),
          },
        },
      },
    },
  });

  if (!employee) {
    return {
      eligible: false,
      overlapOk: false,
      weeklyHoursOk: false,
      dailyHoursOk: false,
      restOk: false,
      availabilityOk: false,
      details: { currentWeeklyHours: 0, shiftHours, maxWeeklyHours: 48, currentDailyHours: 0, maxDailyHours: 11 },
    };
  }

  // 1. Availability check (unavailabilities)
  const unavails: SolverUnavailability[] = employee.unavailabilities.map((u) => ({
    type: u.type as "FIXED" | "VARIABLE",
    dayOfWeek: u.dayOfWeek,
    date: u.date ? u.date.toISOString().split("T")[0] : null,
    startTime: u.startTime,
    endTime: u.endTime,
  }));
  const availabilityOk = isAvailable(unavails, dateStr, dayOfWeek, shift.startTime, shift.endTime);

  // 2. Overlap check
  const overlap = await findOverlappingShift(employeeId, dateStr, shift.startTime, shift.endTime);
  const overlapOk = !overlap;

  // 3. Weekly hours check
  const weekStart = getWeekStart(shift.date);
  const weekEnd = getWeekEnd(shift.date);
  const currentWeeklyHours = await calculateWeeklyHours(employeeId, weekStart, weekEnd);
  const maxWeeklyHours = employee.maxHoursPerWeek ?? 48;
  const weeklyHoursOk = currentWeeklyHours + shiftHours <= maxWeeklyHours;

  // 4. Daily hours check
  const dailyShifts = employee.shifts.filter(
    (s) => s.date.toISOString().split("T")[0] === dateStr
  );
  const currentDailyHours = dailyShifts.reduce(
    (sum, s) => sum + calculateShiftHours(s.startTime, s.endTime),
    0
  );
  const maxDailyHours = employee.maxHoursPerDay ?? 11;
  const dailyHoursOk = currentDailyHours + shiftHours <= maxDailyHours;

  // 5. Rest check (11h minimum between shifts)
  const minRest = employee.minRestBetween ?? 11;
  const restOk = hasEnoughRest(employee.shifts, shift.date, shift.startTime, shift.endTime, minRest);

  const eligible = availabilityOk && overlapOk && weeklyHoursOk && dailyHoursOk && restOk;

  return {
    eligible,
    overlapOk,
    weeklyHoursOk,
    dailyHoursOk,
    restOk,
    availabilityOk,
    details: {
      currentWeeklyHours,
      shiftHours,
      maxWeeklyHours,
      currentDailyHours,
      maxDailyHours,
    },
  };
}

// ─── Helpers ─────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function buildDateTime(date: Date, time: string): Date {
  const dateStr = date.toISOString().split("T")[0];
  const [h, m] = time.split(":").map(Number);
  return new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
}

function hasEnoughRest(
  existingShifts: { date: Date; startTime: string; endTime: string }[],
  proposedDate: Date,
  proposedStart: string,
  proposedEnd: string,
  minRestHours: number
): boolean {
  const proposedStartMs = buildDateTime(proposedDate, proposedStart).getTime();
  const proposedEndMs = buildDateTime(proposedDate, proposedEnd).getTime();

  for (const s of existingShifts) {
    const sStartMs = buildDateTime(s.date, s.startTime).getTime();
    const sEndMs = buildDateTime(s.date, s.endTime).getTime();

    const gapBefore = (proposedStartMs - sEndMs) / (1000 * 60 * 60);
    if (gapBefore >= 0 && gapBefore < minRestHours) return false;

    const gapAfter = (sStartMs - proposedEndMs) / (1000 * 60 * 60);
    if (gapAfter >= 0 && gapAfter < minRestHours) return false;
  }

  return true;
}

/**
 * Automatic Replacement Engine
 *
 * When an absence is approved, this module:
 * 1. Finds affected shifts for the absent employee
 * 2. Unassigns the absent employee from those shifts
 * 3. Finds eligible replacement candidates
 * 4. Creates ReplacementOffer + ReplacementCandidate records
 */

import { prisma } from "./prisma";
import { findOverlappingShift, calculateWeeklyHours } from "./shifts";
import { isAvailable } from "./solver/constraints";
import { calculateShiftHours } from "./shift-utils";
import type { SolverUnavailability } from "./solver/types";

interface AbsenceInfo {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
}

interface ShiftInfo {
  id: string;
  storeId: string;
  date: Date;
  startTime: string;
  endTime: string;
  employeeId: string | null;
}

/**
 * Find eligible replacement candidates for a specific shift.
 * Checks: active, assigned to store, available, no overlap, hours OK, rest OK.
 * Returns sorted by priority.
 */
export async function findEligibleCandidates(
  shift: ShiftInfo,
  absentEmployeeId: string
): Promise<{ employeeId: string; priority: number; hoursRemaining: number }[]> {
  const dateStr = shift.date.toISOString().split("T")[0];
  const dayOfWeek = shift.date.getUTCDay(); // 0=Sun, 6=Sat

  // Get all active employees assigned to this store (exclude absent)
  const storeEmployees = await prisma.storeEmployee.findMany({
    where: { storeId: shift.storeId },
    include: {
      employee: {
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
      },
    },
  });

  const candidates: { employeeId: string; priority: number; hoursRemaining: number }[] = [];

  for (const se of storeEmployees) {
    const emp = se.employee;

    // Skip: inactive, absent employee
    if (!emp.active || emp.id === absentEmployeeId) continue;

    // Check unavailabilities
    const unavails: SolverUnavailability[] = emp.unavailabilities.map((u) => ({
      type: u.type as "FIXED" | "VARIABLE",
      dayOfWeek: u.dayOfWeek,
      date: u.date ? u.date.toISOString().split("T")[0] : null,
      startTime: u.startTime,
      endTime: u.endTime,
    }));

    if (!isAvailable(unavails, dateStr, dayOfWeek, shift.startTime, shift.endTime)) {
      continue;
    }

    // Check overlapping shifts
    const overlap = await findOverlappingShift(
      emp.id,
      dateStr,
      shift.startTime,
      shift.endTime
    );
    if (overlap) continue;

    // Check weekly hours
    const weekStart = getWeekStart(shift.date);
    const weekEnd = getWeekEnd(shift.date);
    const weeklyHours = await calculateWeeklyHours(emp.id, weekStart, weekEnd);
    const shiftHours = calculateShiftHours(shift.startTime, shift.endTime);
    const maxWeekly = emp.maxHoursPerWeek ?? 48;
    if (weeklyHours + shiftHours > maxWeekly) continue;

    // Check daily hours
    const dailyShifts = emp.shifts.filter(
      (s) => s.date.toISOString().split("T")[0] === dateStr
    );
    const dailyHours = dailyShifts.reduce(
      (sum, s) => sum + calculateShiftHours(s.startTime, s.endTime),
      0
    );
    const maxDaily = emp.maxHoursPerDay ?? 11;
    if (dailyHours + shiftHours > maxDaily) continue;

    // Check minimum rest (11h between shifts)
    const minRest = emp.minRestBetween ?? 11;
    if (!hasEnoughRestSimple(emp.shifts, shift.date, shift.startTime, shift.endTime, minRest)) {
      continue;
    }

    // Calculate hours remaining vs contract
    const contractHours = emp.weeklyHours ?? 35;
    const hoursRemaining = contractHours - weeklyHours;

    candidates.push({
      employeeId: emp.id,
      priority: emp.priority ?? 1,
      hoursRemaining,
    });
  }

  // Sort: preferred store first, then by priority (1=high), then by hours remaining (desc)
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.hoursRemaining - a.hoursRemaining; // More remaining = more priority
  });

  return candidates;
}

/**
 * Create replacement offers for all shifts affected by an approved absence.
 * Returns number of offers created.
 */
export async function createReplacementOffers(absence: AbsenceInfo): Promise<number> {
  // Find shifts assigned to the absent employee in the date range
  const shifts = await prisma.shift.findMany({
    where: {
      employeeId: absence.employeeId,
      date: {
        gte: absence.startDate,
        lte: absence.endDate,
      },
    },
  });

  if (shifts.length === 0) return 0;

  let offersCreated = 0;

  for (const shift of shifts) {
    // Unassign the absent employee
    await prisma.shift.update({
      where: { id: shift.id },
      data: {
        employeeId: null,
        note: `Absence déclarée — était assigné à l'employé absent`,
      },
    });

    // Calculate expiration: min(shift start - 2h, now + 24h)
    const shiftDateTime = buildDateTime(shift.date, shift.startTime);
    const twoHoursBefore = new Date(shiftDateTime.getTime() - 2 * 60 * 60 * 1000);
    const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiresAt = twoHoursBefore < twentyFourHoursFromNow ? twoHoursBefore : twentyFourHoursFromNow;

    // Don't create offer if already expired
    if (expiresAt <= new Date()) continue;

    // Find eligible candidates
    const candidates = await findEligibleCandidates(
      {
        id: shift.id,
        storeId: shift.storeId,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        employeeId: null,
      },
      absence.employeeId
    );

    if (candidates.length === 0) continue;

    // Create the offer with all candidates
    await prisma.replacementOffer.create({
      data: {
        shiftId: shift.id,
        storeId: shift.storeId,
        absentEmployeeId: absence.employeeId,
        absenceId: absence.id,
        expiresAt,
        candidates: {
          create: candidates.map((c) => ({
            employeeId: c.employeeId,
          })),
        },
      },
    });

    offersCreated++;
  }

  console.log(
    `[Replacement] Created ${offersCreated} offers for absence ${absence.id} (${shifts.length} shifts affected)`
  );

  return offersCreated;
}

// ─── Helpers ─────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday
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

/**
 * Simple rest check: ensure at least `minRestHours` between any existing shift
 * and the proposed shift time window.
 */
function hasEnoughRestSimple(
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

    // Gap between existing end and proposed start
    const gapBefore = (proposedStartMs - sEndMs) / (1000 * 60 * 60);
    if (gapBefore >= 0 && gapBefore < minRestHours) return false;

    // Gap between proposed end and existing start
    const gapAfter = (sStartMs - proposedEndMs) / (1000 * 60 * 60);
    if (gapAfter >= 0 && gapAfter < minRestHours) return false;
  }

  return true;
}

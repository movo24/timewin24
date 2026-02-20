import { prisma } from "./prisma";
import { doTimesOverlap, type ShiftTime } from "./shift-utils";

// Re-export for consumers
export { doTimesOverlap, type ShiftTime } from "./shift-utils";

/**
 * Normalize a date to UTC midnight to match Prisma @db.Date storage.
 * "2025-02-18" → Date(2025-02-18T00:00:00.000Z)
 */
function toDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Extract YYYY-MM-DD string from a Date object (handles both
 * Date objects and ISO strings returned by Prisma).
 */
function toDateString(d: Date | string): string {
  if (typeof d === "string") return d.split("T")[0];
  return d.toISOString().split("T")[0];
}

/**
 * Check if a new/updated shift would overlap with existing shifts
 * for the same employee. Returns the conflicting shift if found.
 */
export async function findOverlappingShift(
  employeeId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeShiftId?: string
) {
  // Use a range query to avoid timezone issues with @db.Date
  const targetDate = toDateOnly(date);
  const dayAfter = new Date(targetDate);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  const existingShifts = await prisma.shift.findMany({
    where: {
      employeeId,
      date: {
        gte: targetDate,
        lt: dayAfter,
      },
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
    },
    include: { store: true },
  });

  for (const existing of existingShifts) {
    const existingDate = toDateString(existing.date);
    const newShift: ShiftTime = { date, startTime, endTime };
    const existingTime: ShiftTime = {
      date: existingDate,
      startTime: existing.startTime,
      endTime: existing.endTime,
    };

    if (doTimesOverlap(newShift, existingTime)) {
      return existing;
    }
  }

  return null;
}

/**
 * Calculate total hours for an employee in a given week.
 */
export async function calculateWeeklyHours(
  employeeId: string,
  weekStart: Date,
  weekEnd: Date,
  excludeShiftId?: string
): Promise<number> {
  const shifts = await prisma.shift.findMany({
    where: {
      employeeId,
      date: { gte: weekStart, lte: weekEnd },
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
    },
  });

  let totalMinutes = 0;
  for (const shift of shifts) {
    const [startH, startM] = shift.startTime.split(":").map(Number);
    const [endH, endM] = shift.endTime.split(":").map(Number);
    totalMinutes += endH * 60 + endM - (startH * 60 + startM);
  }

  return totalMinutes / 60;
}

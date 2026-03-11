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
  employeeId: string | null | undefined,
  date: string,
  startTime: string,
  endTime: string,
  excludeShiftId?: string
) {
  // Unassigned shifts cannot overlap with anyone
  if (!employeeId) return null;

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
 * Check if a shift would violate the store's overlap policy.
 * Returns violation info if found, null if OK.
 */
export async function findStoreOverlapViolation(
  storeId: string,
  employeeId: string | null | undefined,
  date: string,
  startTime: string,
  endTime: string,
  excludeShiftId?: string
): Promise<{ storeName: string; overlapMinutes: number } | null> {
  if (!employeeId) return null;

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { name: true, allowOverlap: true, maxOverlapMinutes: true },
  });
  if (!store) return null;

  const effectiveMax = store.allowOverlap ? store.maxOverlapMinutes : 0;

  // Use a range query to avoid timezone issues with @db.Date
  const targetDate = toDateOnly(date);
  const dayAfter = new Date(targetDate);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  // Find all shifts from OTHER employees at same store on same day
  const otherShifts = await prisma.shift.findMany({
    where: {
      storeId,
      date: { gte: targetDate, lt: dayAfter },
      employeeId: { not: employeeId },
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
    },
  });

  const [startH, startM] = startTime.split(":").map(Number);
  const startMin = startH * 60 + startM;
  const [endH, endM] = endTime.split(":").map(Number);
  const endMin = endH * 60 + endM;

  for (const s of otherShifts) {
    if (!s.employeeId) continue; // skip unassigned shifts
    const [sH, sM] = s.startTime.split(":").map(Number);
    const sStart = sH * 60 + sM;
    const [eH, eM] = s.endTime.split(":").map(Number);
    const sEnd = eH * 60 + eM;
    const overlap = Math.max(0, Math.min(endMin, sEnd) - Math.max(startMin, sStart));
    if (overlap > effectiveMax) {
      return { storeName: store.name, overlapMinutes: overlap };
    }
  }

  return null;
}

/**
 * Check if a shift falls within the store's opening hours for that day.
 * Returns violation info if the shift is outside hours or on a closed day.
 */
export async function findStoreHoursViolation(
  storeId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ reason: string } | null> {
  const [y, m, d] = date.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  const schedule = await prisma.storeSchedule.findFirst({
    where: { storeId, dayOfWeek },
  });

  // No schedule configured → no constraint
  if (!schedule) return null;

  if (schedule.closed) {
    return { reason: "Le magasin est fermé ce jour-là" };
  }

  if (schedule.openTime && startTime < schedule.openTime) {
    return { reason: `Le shift commence avant l'ouverture du magasin (${schedule.openTime})` };
  }

  if (schedule.closeTime && endTime > schedule.closeTime) {
    return { reason: `Le shift se termine après la fermeture du magasin (${schedule.closeTime})` };
  }

  return null;
}

/**
 * Check if adding a shift for this employee would exceed the store's
 * max distinct employees per day. Returns violation info if exceeded.
 */
export async function findMaxEmployeesViolation(
  storeId: string,
  date: string,
  employeeId: string | null | undefined,
  excludeShiftId?: string
): Promise<{ reason: string; current: number; max: number } | null> {
  if (!employeeId) return null;

  const [y, m, d] = date.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      maxEmployees: true,
      schedules: { where: { dayOfWeek } },
    },
  });
  if (!store) return null;

  // Day-level override takes priority over store default
  const effectiveMax = store.schedules[0]?.maxEmployees ?? store.maxEmployees;
  if (effectiveMax === null || effectiveMax === undefined) return null; // unlimited

  // Count distinct employees on that day at that store
  const targetDate = toDateOnly(date);
  const dayAfter = new Date(targetDate);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  const dayShifts = await prisma.shift.findMany({
    where: {
      storeId,
      date: { gte: targetDate, lt: dayAfter },
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
    },
    select: { employeeId: true },
  });

  const distinctEmployees = new Set<string>();
  for (const s of dayShifts) {
    if (s.employeeId) distinctEmployees.add(s.employeeId);
  }

  // If this employee already has a shift that day, no new distinct employee
  if (distinctEmployees.has(employeeId)) return null;

  if (distinctEmployees.size >= effectiveMax) {
    return {
      reason: `Max employés par jour atteint (${distinctEmployees.size}/${effectiveMax})`,
      current: distinctEmployees.size,
      max: effectiveMax,
    };
  }

  return null;
}

/**
 * Check if adding a shift would exceed the store's max simultaneous employees.
 * Uses a sweep-line algorithm to find peak concurrent employees.
 * Sorts delta -1 before +1 at the same time so exact relays (A ends 15h, B starts 15h)
 * count as 1 simultaneous, not 2.
 */
export async function findMaxSimultaneousViolation(
  storeId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeShiftId?: string
): Promise<{ reason: string; peak: number; max: number } | null> {
  const [y, m, d] = date.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      maxSimultaneous: true,
      schedules: { where: { dayOfWeek } },
    },
  });
  if (!store) return null;

  const effectiveMax = store.schedules[0]?.maxSimultaneous ?? store.maxSimultaneous;
  // Default is 1; if somehow null/undefined, skip
  if (effectiveMax === null || effectiveMax === undefined) return null;

  const targetDate = toDateOnly(date);
  const dayAfter = new Date(targetDate);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  const dayShifts = await prisma.shift.findMany({
    where: {
      storeId,
      date: { gte: targetDate, lt: dayAfter },
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
    },
    select: { startTime: true, endTime: true, employeeId: true },
  });

  // Build sweep-line events
  const toMin = (t: string) => {
    const [h, mi] = t.split(":").map(Number);
    return h * 60 + mi;
  };

  const events: { time: number; delta: number }[] = [];

  for (const s of dayShifts) {
    if (!s.employeeId) continue; // skip unassigned
    events.push({ time: toMin(s.startTime), delta: 1 });
    events.push({ time: toMin(s.endTime), delta: -1 });
  }

  // Add the proposed shift
  events.push({ time: toMin(startTime), delta: 1 });
  events.push({ time: toMin(endTime), delta: -1 });

  // Sort: by time, then delta -1 before +1 (departures before arrivals at same time)
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);

  let concurrent = 0;
  let peak = 0;
  for (const e of events) {
    concurrent += e.delta;
    peak = Math.max(peak, concurrent);
  }

  if (peak > effectiveMax) {
    return {
      reason: `Max employés simultanés dépassé (${peak}/${effectiveMax})`,
      peak,
      max: effectiveMax,
    };
  }

  return null;
}

/**
 * Calculate total hours for an employee in a given week.
 */
export async function calculateWeeklyHours(
  employeeId: string | null | undefined,
  weekStart: Date,
  weekEnd: Date,
  excludeShiftId?: string
): Promise<number> {
  // Unassigned shifts have no weekly hours concept
  if (!employeeId) return 0;

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

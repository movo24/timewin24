/**
 * Data Loader — Loads all data from Prisma and transforms it
 * into the denormalized SolverInput expected by the pure solver.
 *
 * This is the ONLY file in the solver package that accesses the database.
 */

import { prisma } from "@/lib/prisma";
import { calculateEmployerCost, FRANCE_2026_DEFAULTS } from "@/lib/employer-cost";
import type {
  SolverInput,
  SolverEmployee,
  SolverStore,
  SolverStoreSchedule,
  SolverExistingShift,
  SolverUnavailability,
  DaySlot,
  SolverOptions,
} from "./types";

/**
 * Format a Date to "YYYY-MM-DD" string.
 */
function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Get day of week (0=Dim, 1=Lun, ..., 6=Sam) matching schema convention.
 */
function getDayOfWeek(d: Date): number {
  return d.getUTCDay(); // 0=Sunday=Dim
}

/**
 * Get all 7 dates of a week starting from Monday.
 */
function getWeekDates(weekStart: string): Date[] {
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(start);
    dt.setUTCDate(start.getUTCDate() + i);
    dates.push(dt);
  }
  return dates;
}

/**
 * Compute employer cost per hour for an employee.
 * Uses the EmployeeCost + CountryConfig if available, or returns null.
 */
async function computeCostPerHour(employeeId: string): Promise<number | null> {
  const costConfig = await prisma.employeeCost.findUnique({
    where: { employeeId },
    include: { country: true },
  });

  if (!costConfig) return null;

  const rules = costConfig.country
    ? {
        code: costConfig.country.code,
        name: costConfig.country.name,
        currency: costConfig.country.currency,
        minimumWageHour: costConfig.country.minimumWageHour,
        employerRate: costConfig.country.employerRate,
        reductionEnabled: costConfig.country.reductionEnabled,
        reductionMaxCoeff: costConfig.country.reductionMaxCoeff,
        reductionThreshold: costConfig.country.reductionThreshold,
        extraHourlyCost: costConfig.country.extraHourlyCost,
      }
    : FRANCE_2026_DEFAULTS;

  const breakdown = calculateEmployerCost({
    hourlyRateGross: costConfig.hourlyRateGross,
    hours: 1, // per-hour cost
    rules,
    employerRateOverride: costConfig.employerRateOverride,
    extraHourlyCostOverride: costConfig.extraHourlyCostOverride,
  });

  return breakdown.costPerHour;
}

/**
 * Load all data needed by the solver for a specific store + week.
 *
 * @param storeId - The store to generate planning for
 * @param weekStart - Monday of the target week ("YYYY-MM-DD")
 * @param options - Solver options (mode, shift duration, etc.)
 */
export async function loadSolverInput(
  storeId: string,
  weekStart: string,
  options: SolverOptions
): Promise<SolverInput> {
  // ─── 1. Load Store + Schedules ───────────────────

  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    include: {
      schedules: { orderBy: { dayOfWeek: "asc" } },
    },
  });

  const schedulesMap = new Map<number, SolverStoreSchedule>();
  for (const s of store.schedules) {
    if (!s.closed && s.openTime && s.closeTime) {
      schedulesMap.set(s.dayOfWeek, {
        dayOfWeek: s.dayOfWeek,
        closed: false,
        openTime: s.openTime,
        closeTime: s.closeTime,
        minEmployees: s.minEmployees ?? store.minEmployees ?? 1,
        maxEmployees: s.maxEmployees ?? store.maxEmployees ?? null,
        maxSimultaneous: s.maxSimultaneous ?? null,
      });
    }
    // Closed days are simply not added to the map
  }

  const solverStore: SolverStore = {
    id: store.id,
    name: store.name,
    minEmployees: store.minEmployees ?? 1,
    maxEmployees: store.maxEmployees ?? null,
    needsManager: store.needsManager,
    allowOverlap: store.allowOverlap,
    maxOverlapMinutes: store.maxOverlapMinutes,
    maxSimultaneous: store.maxSimultaneous,
    schedules: schedulesMap,
    importance: store.importance ?? 2,
  };

  // ─── 2. Load Active Employees Assigned to Store ──

  const storeEmployees = await prisma.storeEmployee.findMany({
    where: { storeId },
    include: {
      employee: {
        include: {
          unavailabilities: true,
          costConfig: { include: { country: true } },
        },
      },
    },
  });

  const solverEmployees: SolverEmployee[] = [];

  for (const se of storeEmployees) {
    const emp = se.employee;
    if (!emp.active) continue;

    // Compute cost per hour
    let costPerHour: number | null = null;
    if (emp.costConfig) {
      const rules = emp.costConfig.country
        ? {
            code: emp.costConfig.country.code,
            name: emp.costConfig.country.name,
            currency: emp.costConfig.country.currency,
            minimumWageHour: emp.costConfig.country.minimumWageHour,
            employerRate: emp.costConfig.country.employerRate,
            reductionEnabled: emp.costConfig.country.reductionEnabled,
            reductionMaxCoeff: emp.costConfig.country.reductionMaxCoeff,
            reductionThreshold: emp.costConfig.country.reductionThreshold,
            extraHourlyCost: emp.costConfig.country.extraHourlyCost,
          }
        : FRANCE_2026_DEFAULTS;

      const breakdown = calculateEmployerCost({
        hourlyRateGross: emp.costConfig.hourlyRateGross,
        hours: 1,
        rules,
        employerRateOverride: emp.costConfig.employerRateOverride,
        extraHourlyCostOverride: emp.costConfig.extraHourlyCostOverride,
      });
      costPerHour = breakdown.costPerHour;
    }

    // Map unavailabilities
    const unavailabilities: SolverUnavailability[] = emp.unavailabilities.map(
      (u) => ({
        type: u.type as "FIXED" | "VARIABLE",
        dayOfWeek: u.dayOfWeek,
        date: u.date ? formatDate(u.date) : null,
        startTime: u.startTime,
        endTime: u.endTime,
      })
    );

    solverEmployees.push({
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      weeklyHours: emp.weeklyHours,
      contractType: emp.contractType,
      priority: emp.priority,
      maxHoursPerDay: emp.maxHoursPerDay ?? 10,
      maxHoursPerWeek: emp.maxHoursPerWeek ?? 48,
      minRestBetween: emp.minRestBetween ?? 11,
      skills: emp.skills as string[],
      preferredStoreId: emp.preferredStoreId,
      shiftPreference: (emp.shiftPreference as "MATIN" | "APRES_MIDI" | "JOURNEE") || "JOURNEE",
      costPerHour,
      unavailabilities,
      reliabilityScore: emp.reliabilityScore ?? null,
      profileCategory: (emp.profileCategory as "A" | "B" | "C") ?? null,
    });
  }

  // ─── 3. Load ALL Existing Shifts for These Employees This Week ──
  // Important: load shifts from ALL stores (not just this one) to correctly
  // check weekly hours, overlaps, and rest constraints.

  const weekDates = getWeekDates(weekStart);
  const weekStartDate = weekDates[0];
  const weekEndDate = new Date(weekDates[6]);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 1); // exclusive end

  const employeeIds = solverEmployees.map((e) => e.id);

  const existingShiftsRaw = employeeIds.length > 0
    ? await prisma.shift.findMany({
        where: {
          employeeId: { in: employeeIds },
          date: {
            gte: weekStartDate,
            lt: weekEndDate,
          },
        },
      })
    : [];

  // Also load unassigned shifts for this store (needed for coverage gap detection)
  const unassignedShiftsRaw = await prisma.shift.findMany({
    where: {
      storeId,
      employeeId: { equals: null },
      date: {
        gte: weekStartDate,
        lt: weekEndDate,
      },
    },
  });

  const existingShifts: SolverExistingShift[] = [
    ...existingShiftsRaw.map((s) => ({
      id: s.id,
      employeeId: s.employeeId,
      storeId: s.storeId,
      date: formatDate(s.date),
      startTime: s.startTime,
      endTime: s.endTime,
    })),
    ...unassignedShiftsRaw.map((s) => ({
      id: s.id,
      employeeId: null,
      storeId: s.storeId,
      date: formatDate(s.date),
      startTime: s.startTime,
      endTime: s.endTime,
    })),
  ];

  // ─── 4. Build Week Days (open days only) ─────────

  const weekDays: DaySlot[] = [];

  for (const dt of weekDates) {
    const dow = getDayOfWeek(dt);
    const schedule = schedulesMap.get(dow);
    if (schedule) {
      weekDays.push({
        date: formatDate(dt),
        dayOfWeek: dow,
        schedule,
      });
    }
  }

  return {
    store: solverStore,
    employees: solverEmployees,
    existingShifts,
    weekDays,
    options,
  };
}

/**
 * Load solver inputs for ALL stores at once.
 * Returns an array of SolverInput, one per store with active employees.
 */
export async function loadAllStoresSolverInput(
  weekStart: string,
  options: SolverOptions
): Promise<SolverInput[]> {
  const stores = await prisma.store.findMany({
    include: { schedules: { orderBy: { dayOfWeek: "asc" } } },
    orderBy: { name: "asc" },
  });

  const inputs: SolverInput[] = [];

  for (const store of stores) {
    const input = await loadSolverInput(store.id, weekStart, options);
    // Only include stores that have employees assigned
    if (input.employees.length > 0 && input.weekDays.length > 0) {
      inputs.push(input);
    }
  }

  // Sort by importance (1=critique first, 3=secondaire last)
  inputs.sort((a, b) => a.store.importance - b.store.importance);

  return inputs;
}

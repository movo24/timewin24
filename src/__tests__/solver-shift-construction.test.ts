/**
 * Tests for the shift-construction solver.
 *
 * Validates:
 *   1. Step 1 — full coverage by a single employee
 *   2. Step 2 — balanced 2-employee relay when no single employee can cover the day
 *   3. Hard minimum of 4h per shift (MIN_SHIFT_HOURS)
 *   4. Unassigned shifts when no employees are available
 *   5. Weekly hours cap respected
 *   6. Daily hours cap respected
 *   7. No gaps between shifts (contiguity)
 */

import { solve } from "@/lib/solver/solver";
import type {
  SolverInput,
  SolverStore,
  SolverStoreSchedule,
  SolverEmployee,
  SolverExistingShift,
  SolverUnavailability,
  DaySlot,
  SolverOptions,
} from "@/lib/solver/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function utcDayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function makeSchedule(
  dayOfWeek: number,
  openTime: string,
  closeTime: string,
  overrides: Partial<SolverStoreSchedule> = {},
): SolverStoreSchedule {
  return {
    dayOfWeek,
    closed: false,
    openTime,
    closeTime,
    minEmployees: 1,
    maxEmployees: null,
    maxSimultaneous: null,
    ...overrides,
  };
}

function makeStore(
  openTime: string,
  closeTime: string,
  date: string,
  overrides: Partial<SolverStore> = {},
): SolverStore {
  const dow = utcDayOfWeek(date);
  const schedule = makeSchedule(dow, openTime, closeTime);
  return {
    id: "store-1",
    name: "Test Store",
    minEmployees: 1,
    maxEmployees: null,
    needsManager: false,
    allowOverlap: false,
    maxOverlapMinutes: 0,
    maxSimultaneous: 2, // allow 2 employees simultaneously by default
    schedules: new Map([[dow, schedule]]),
    importance: 2,
    ...overrides,
  };
}

function makeEmployee(
  id: string,
  overrides: Partial<SolverEmployee> = {},
): SolverEmployee {
  return {
    id,
    firstName: "Emp",
    lastName: id,
    weeklyHours: 35,
    contractType: "CDI",
    priority: 2,
    maxHoursPerDay: 10,
    maxHoursPerWeek: 48,
    minRestBetween: 11,
    skills: [],
    preferredStoreId: null,
    shiftPreference: "JOURNEE",
    costPerHour: null,
    unavailabilities: [],
    reliabilityScore: null,
    profileCategory: null,
    ...overrides,
  };
}

function makeInput(
  employees: SolverEmployee[],
  openTime: string,
  closeTime: string,
  date = "2026-04-14",
  existingShifts: SolverExistingShift[] = [],
): SolverInput {
  const dow = utcDayOfWeek(date);
  const schedule = makeSchedule(dow, openTime, closeTime);
  const store = makeStore(openTime, closeTime, date);
  const options: SolverOptions = {
    mode: "preview",
    shiftDurationHours: 8,
    shiftGranularity: 30,
  };
  return {
    store,
    employees,
    existingShifts,
    weekDays: [{ date, dayOfWeek: dow, schedule }],
    options,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Solver — shift construction mode", () => {

  // ── Step 1: Full coverage by a single employee ───────────────────────────

  describe("Step 1 — single employee covers the full range", () => {
    it("assigns one employee for a short day (8h)", () => {
      const emp = makeEmployee("emp1");
      const input = makeInput([emp], "08:00", "16:00");
      const result = solve(input);

      const assigned = result.shifts.filter(s => s.employeeId !== null);
      expect(assigned).toHaveLength(1);
      expect(assigned[0].employeeId).toBe("emp1");
      expect(assigned[0].startTime).toBe("08:00");
      expect(assigned[0].endTime).toBe("16:00");
      expect(assigned[0].hours).toBe(8);
      expect(result.stats.unassignedCount).toBe(0);
    });

    it("assigns one employee for a 10h day (maxHoursPerDay limit)", () => {
      const emp = makeEmployee("emp1", { maxHoursPerDay: 10 });
      const input = makeInput([emp], "07:00", "17:00"); // exactly 10h
      const result = solve(input);

      const assigned = result.shifts.filter(s => s.employeeId !== null);
      expect(assigned).toHaveLength(1);
      expect(assigned[0].hours).toBe(10);
      expect(result.stats.unassignedCount).toBe(0);
    });
  });

  // ── Step 2: Balanced 2-employee relay ────────────────────────────────────

  describe("Step 2 — balanced relay when no single employee can cover the day", () => {
    it("splits a 13.5h day into 2 contiguous shifts", () => {
      // 07:00–20:30 = 13.5h, no single employee (maxHoursPerDay=10) can cover it alone
      const emp1 = makeEmployee("emp1");
      const emp2 = makeEmployee("emp2");
      const input = makeInput([emp1, emp2], "07:00", "20:30");
      const result = solve(input);

      const assigned = result.shifts.filter(s => s.employeeId !== null);
      expect(assigned).toHaveLength(2);

      const sorted = [...assigned].sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );

      // Coverage starts at open and ends at close
      expect(sorted[0].startTime).toBe("07:00");
      expect(sorted[1].endTime).toBe("20:30");

      // No gap: first shift ends exactly where second begins
      expect(sorted[0].endTime).toBe(sorted[1].startTime);

      expect(result.stats.unassignedCount).toBe(0);
    });

    it("neither shift is shorter than 4h (hard minimum)", () => {
      const emp1 = makeEmployee("emp1");
      const emp2 = makeEmployee("emp2");
      const input = makeInput([emp1, emp2], "07:00", "20:30");
      const result = solve(input);

      const assigned = result.shifts.filter(s => s.employeeId !== null);
      assigned.forEach(s => {
        expect(s.hours).toBeGreaterThanOrEqual(4);
      });
    });

    it("split is balanced — difference between the two shifts ≤ 4h", () => {
      const emp1 = makeEmployee("emp1");
      const emp2 = makeEmployee("emp2");
      const input = makeInput([emp1, emp2], "07:00", "20:30");
      const result = solve(input);

      const assigned = result.shifts.filter(s => s.employeeId !== null);
      expect(assigned).toHaveLength(2);

      const [h1, h2] = assigned.map(s => s.hours);
      const diff = Math.abs(h1 - h2);
      // Balanced relay: neither employee should get > 4h more than the other
      expect(diff).toBeLessThanOrEqual(4);
    });

    it("relay point is within ±3h of the day centre", () => {
      const emp1 = makeEmployee("emp1");
      const emp2 = makeEmployee("emp2");
      const input = makeInput([emp1, emp2], "07:00", "20:30");
      const result = solve(input);

      const assigned = result.shifts
        .filter(s => s.employeeId !== null)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      expect(assigned).toHaveLength(2);

      const relayMin = timeToMinutes(assigned[0].endTime);
      const openMin = timeToMinutes("07:00");
      const closeMin = timeToMinutes("20:30");
      const centreMin = (openMin + closeMin) / 2; // ~13:45

      // Relay should fall within ±3h of centre (i.e. 10:45–16:45)
      expect(relayMin).toBeGreaterThanOrEqual(centreMin - 3 * 60);
      expect(relayMin).toBeLessThanOrEqual(centreMin + 3 * 60);
    });

    it("two different employees are assigned (no duplicate assignments)", () => {
      const emp1 = makeEmployee("emp1");
      const emp2 = makeEmployee("emp2");
      const input = makeInput([emp1, emp2], "07:00", "20:30");
      const result = solve(input);

      const assigned = result.shifts.filter(s => s.employeeId !== null);
      expect(assigned).toHaveLength(2);

      const ids = new Set(assigned.map(s => s.employeeId));
      expect(ids.size).toBe(2); // two distinct employees
    });
  });

  // ── Hard minimum shift hours ──────────────────────────────────────────────

  describe("Hard minimum shift hours (4h)", () => {
    it("creates an unassigned shift when the range is only 3h", () => {
      // 3h range < MIN_SHIFT_HOURS (4h) → no valid shift can be created
      const emp = makeEmployee("emp1");
      const input = makeInput([emp], "07:00", "10:00"); // 3h
      const result = solve(input);

      // Employee cannot be assigned (shift would be < 4h)
      const assigned = result.shifts.filter(s => s.employeeId !== null);
      expect(assigned).toHaveLength(0);

      const unassigned = result.shifts.filter(s => s.employeeId === null);
      expect(unassigned.length).toBeGreaterThan(0);
    });

    it("never assigns a shift shorter than 4h in any scenario", () => {
      const emp1 = makeEmployee("emp1");
      const emp2 = makeEmployee("emp2");
      // 16h day — any split creates two 8h shifts (well above 4h)
      const input = makeInput([emp1, emp2], "07:00", "23:00");
      const result = solve(input);

      const assigned = result.shifts.filter(s => s.employeeId !== null);
      assigned.forEach(s => {
        expect(s.hours).toBeGreaterThanOrEqual(4);
      });
    });
  });

  // ── No employees available ────────────────────────────────────────────────

  describe("Unassigned shifts when employees are unavailable", () => {
    it("creates an unassigned shift when the only employee is unavailable all day", () => {
      const dow = utcDayOfWeek("2026-04-13"); // Monday = 1
      const emp = makeEmployee("emp1", {
        unavailabilities: [
          {
            type: "FIXED",
            dayOfWeek: dow,
            date: null,
            startTime: null, // full-day unavailability
            endTime: null,
          } as SolverUnavailability,
        ],
      });
      const input = makeInput([emp], "09:00", "17:00", "2026-04-13");
      const result = solve(input);

      expect(result.stats.unassignedCount).toBeGreaterThan(0);
      const unassigned = result.shifts.filter(s => s.employeeId === null);
      expect(unassigned.length).toBeGreaterThan(0);
    });

    it("creates no shifts at all when there are no employees", () => {
      const input = makeInput([], "09:00", "17:00");
      const result = solve(input);

      const assigned = result.shifts.filter(s => s.employeeId !== null);
      expect(assigned).toHaveLength(0);
      // The range creates an unassigned slot
      expect(result.stats.unassignedCount).toBeGreaterThan(0);
    });
  });

  // ── Weekly hours cap ─────────────────────────────────────────────────────

  describe("Weekly hours cap", () => {
    it("respects maxHoursPerWeek — employee does not exceed weekly limit", () => {
      // Employee has 44h already used this week (4 × 11h shifts)
      // maxHoursPerWeek = 48 → only 4h remaining
      const emp = makeEmployee("emp1", { maxHoursPerWeek: 48 });
      const existingShifts: SolverExistingShift[] = [
        { id: "e1", employeeId: "emp1", storeId: "store-1", date: "2026-04-07", startTime: "07:00", endTime: "18:00" }, // 11h
        { id: "e2", employeeId: "emp1", storeId: "store-1", date: "2026-04-08", startTime: "07:00", endTime: "18:00" }, // 11h
        { id: "e3", employeeId: "emp1", storeId: "store-1", date: "2026-04-09", startTime: "07:00", endTime: "18:00" }, // 11h
        { id: "e4", employeeId: "emp1", storeId: "store-1", date: "2026-04-10", startTime: "07:00", endTime: "18:00" }, // 11h
        // total: 44h used, 4h remaining
      ];
      const input = makeInput([emp], "07:00", "20:30", "2026-04-14", existingShifts);
      const result = solve(input);

      const assignedToEmp = result.shifts.filter(s => s.employeeId === "emp1");
      const totalAssigned = assignedToEmp.reduce((sum, s) => sum + s.hours, 0);
      // Employee can work at most 4h (48 - 44 = 4)
      expect(totalAssigned).toBeLessThanOrEqual(4);
    });
  });

  // ── Daily hours cap ──────────────────────────────────────────────────────

  describe("Daily hours cap", () => {
    it("respects maxHoursPerDay — employee is not assigned more than their daily limit", () => {
      const emp = makeEmployee("emp1", { maxHoursPerDay: 7 });
      // Day is 12h, employee can only do 7h
      const input = makeInput([emp], "07:00", "19:00");
      const result = solve(input);

      const assignedToEmp = result.shifts.filter(s => s.employeeId === "emp1");
      const totalHours = assignedToEmp.reduce((sum, s) => sum + s.hours, 0);
      expect(totalHours).toBeLessThanOrEqual(7);
    });
  });

  // ── Shift contiguity (no gaps) ────────────────────────────────────────────

  describe("Shift contiguity — no gaps within coverage", () => {
    it("shifts are contiguous — no uncovered time between them", () => {
      const emp1 = makeEmployee("emp1");
      const emp2 = makeEmployee("emp2");
      const input = makeInput([emp1, emp2], "07:00", "20:30");
      const result = solve(input);

      const assigned = result.shifts
        .filter(s => s.employeeId !== null)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      for (let i = 0; i < assigned.length - 1; i++) {
        // Each shift must end exactly where the next one begins
        expect(assigned[i].endTime).toBe(assigned[i + 1].startTime);
      }
    });
  });

  // ── Greedy fallback ──────────────────────────────────────────────────────

  describe("Step 3 — greedy fallback when balanced split is not achievable", () => {
    it("assigns one employee when they can cover 9h out of a 13h day", () => {
      // 2nd employee is unavailable — only emp1 works, covering as much as possible
      const dow = utcDayOfWeek("2026-04-14");
      const emp1 = makeEmployee("emp1", { maxHoursPerDay: 9 });
      const emp2 = makeEmployee("emp2", {
        unavailabilities: [
          {
            type: "FIXED",
            dayOfWeek: dow,
            date: null,
            startTime: null,
            endTime: null,
          } as SolverUnavailability,
        ],
      });
      const input = makeInput([emp1, emp2], "07:00", "20:00"); // 13h
      const result = solve(input);

      const assignedToEmp1 = result.shifts.filter(s => s.employeeId === "emp1");
      const emp1Hours = assignedToEmp1.reduce((sum, s) => sum + s.hours, 0);

      // emp1 covers up to 9h (daily cap)
      expect(emp1Hours).toBeLessThanOrEqual(9);
      // The remaining 4h are unassigned
      expect(result.stats.unassignedCount).toBeGreaterThan(0);
    });
  });
});

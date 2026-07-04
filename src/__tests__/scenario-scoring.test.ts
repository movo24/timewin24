import { scoreScenario } from "@/lib/solver/scenario-scoring";
import { DEFAULT_SCENARIO_CONFIG } from "@/lib/solver/types";
import type {
  SolverResult,
  SolverInput,
  SolverEmployee,
  SolverStore,
  GeneratedShift,
  DaySlot,
  SolverStoreSchedule,
  SlotPhase,
} from "@/lib/solver/types";

// M116 / M002 (solveur) — notation holistique d'un scenario de planning sur 7
// dimensions ponderees (couverture, duree, equilibre, contraintes, cout,
// pauses, placement des profils). Fonctions pures, sans DB.

const sched = (o: Partial<SolverStoreSchedule> = {}): SolverStoreSchedule => ({
  dayOfWeek: 1, closed: false, openTime: "09:00", closeTime: "17:00",
  minEmployees: 1, maxEmployees: null, maxSimultaneous: null, ...o,
});

const dayslot = (o: Partial<DaySlot> = {}): DaySlot => ({
  date: "2026-06-22", dayOfWeek: 1, schedule: sched(o.schedule), ...o,
});

const emp = (o: Partial<SolverEmployee> = {}): SolverEmployee => ({
  id: "e1", firstName: "A", lastName: "B", weeklyHours: 35, contractType: null,
  priority: 1, maxHoursPerDay: 10, maxHoursPerWeek: 48, minRestBetween: 11,
  skills: [], preferredStoreId: null, shiftPreference: "JOURNEE",
  costPerHour: 20, unavailabilities: [], reliabilityScore: 90, profileCategory: "A", ...o,
});

const store = (o: Partial<SolverStore> = {}): SolverStore => ({
  id: "s1", name: "S", minEmployees: 1, maxEmployees: null, needsManager: false,
  allowOverlap: false, maxOverlapMinutes: 0, maxSimultaneous: 1,
  schedules: new Map(), importance: 2, ...o,
});

const input = (o: Partial<SolverInput> = {}): SolverInput => ({
  store: store(o.store), employees: o.employees ?? [], existingShifts: [],
  weekDays: o.weekDays ?? [],
  options: { mode: "preview", shiftDurationHours: 7, shiftGranularity: 30 }, ...o,
});

const gShift = (o: Partial<GeneratedShift> = {}): GeneratedShift => ({
  employeeId: "e1", employeeName: "A B", storeId: "s1", storeName: "S",
  date: "2026-06-22", startTime: "09:00", endTime: "14:00", hours: 5, breakMinutes: 0,
  warnings: [], assignmentReason: null, slotPhase: "MILIEU" as SlotPhase,
  hoursAdjustedReason: null, mergedFromSlots: 1, ...o,
});

const result = (o: Partial<SolverResult> = {}): SolverResult => ({
  shifts: o.shifts ?? [], warnings: o.warnings ?? [], coverageGaps: [],
  stats: {
    totalShiftsGenerated: 0, assignedCount: 0, unassignedCount: 0,
    totalHoursGenerated: 0, daysFullyCovered: 0, daysPartiallyCovered: 0,
    daysUncovered: 0, employeesUsed: 0, solveTimeMs: 0, ...(o.stats ?? {}),
  },
});

const cfg = DEFAULT_SCENARIO_CONFIG; // ideal [4,6], acceptable [3,9]

describe("scoreScenario", () => {
  it("scenario vide -> baseline ponderee deterministe, label 'Bon'", () => {
    // coverage 100, duration 100, balance 50, constraint 100, cost 50,
    // break 100, profile 50 -> total 78
    const out = scoreScenario(result(), input(), cfg);
    expect(out.breakdown).toEqual({
      coverageCompleteness: 100,
      shiftDurationQuality: 100,
      employeeBalance: 50,
      constraintRespect: 100,
      costEfficiency: 50,
      breakQuality: 100,
      profilePlacementQuality: 50,
    });
    expect(out.total).toBe(78);
    expect(out.label).toBe("Bon");
  });

  it("scenario parfait -> 100 / 'Excellent'", () => {
    const out = scoreScenario(
      result({ shifts: [gShift({ hours: 5, startTime: "09:00", endTime: "14:00" })] }),
      input({
        employees: [emp({ id: "e1", weeklyHours: 5, costPerHour: 20 })],
        weekDays: [dayslot({ schedule: sched({ openTime: "09:00", closeTime: "14:00", minEmployees: 1 }) })],
      }),
      cfg
    );
    expect(out.total).toBe(100);
    expect(out.label).toBe("Excellent");
  });

  it("penalise les warnings (constraintRespect)", () => {
    // 2 warnings shift * 5 + 1 global * 3 = 13 -> 87
    const out = scoreScenario(
      result({ shifts: [gShift({ warnings: ["a", "b"] })], warnings: ["g"] }),
      input(),
      cfg
    );
    expect(out.breakdown.constraintRespect).toBe(87);
  });

  it("breakQuality : shift long sans pause = 0, avec pause >=30 = 100", () => {
    const noBreak = scoreScenario(result({ shifts: [gShift({ hours: 7, breakMinutes: 0 })] }), input(), cfg);
    expect(noBreak.breakdown.breakQuality).toBe(0);
    const withBreak = scoreScenario(result({ shifts: [gShift({ hours: 7, breakMinutes: 30 })] }), input(), cfg);
    expect(withBreak.breakdown.breakQuality).toBe(100);
  });

  it("coverageCompleteness : penalite -10 par shift non assigne", () => {
    // besoin 8h (09-17), 1 shift assigne 8h = 100%, +1 shift non assigne -> -10
    const out = scoreScenario(
      result({
        shifts: [
          gShift({ employeeId: "e1", hours: 8, startTime: "09:00", endTime: "17:00" }),
          gShift({ employeeId: null, hours: 0 }),
        ],
      }),
      input({
        employees: [emp({ weeklyHours: 8 })],
        weekDays: [dayslot({ schedule: sched({ openTime: "09:00", closeTime: "17:00", minEmployees: 1 }) })],
      }),
      cfg
    );
    expect(out.breakdown.coverageCompleteness).toBe(90);
  });

  it("shiftDurationQuality : interpolation au-dessus de l'ideal", () => {
    // shift 8h : ideal max 6, accept max 9 -> 100 - (8-6)/(9-6)*30 = 80
    const out = scoreScenario(result({ shifts: [gShift({ hours: 8 })] }), input(), cfg);
    expect(out.breakdown.shiftDurationQuality).toBe(80);
  });

  it("profilePlacementQuality : A vs C en OUVERTURE", () => {
    // ouverture (A=100, C=20)/2 = 60 ; pas de magasin critique -> critical 100
    // combine = 60*0.5 + 100*0.4 + 100*0.1 = 80
    const out = scoreScenario(
      result({
        shifts: [
          gShift({ employeeId: "eA", slotPhase: "OUVERTURE" }),
          gShift({ employeeId: "eC", slotPhase: "OUVERTURE" }),
        ],
      }),
      input({
        employees: [emp({ id: "eA", profileCategory: "A" }), emp({ id: "eC", profileCategory: "C" })],
      }),
      cfg
    );
    expect(out.breakdown.profilePlacementQuality).toBe(80);
  });
});

import { generateCrossStoreSuggestions } from "@/lib/solver/suggestions";
import type {
  SolverResult,
  SolverInput,
  SolverEmployee,
  SolverStore,
  SolverStoreSchedule,
  GeneratedShift,
  SolverUnavailability,
} from "@/lib/solver/types";

// M116 / M002 (solveur) — suggestions inter-magasins post-solve : pour chaque
// shift non assigne, proposer un employe d'un AUTRE magasin (autorise,
// disponible, sous capacite, sans conflit) capable de couvrir le creneau.

const DATE = "2026-06-22"; // lundi -> dayOfWeek 1
const DOW = 1;

const sched = (o: Partial<SolverStoreSchedule> = {}): SolverStoreSchedule => ({
  dayOfWeek: DOW, closed: false, openTime: "08:00", closeTime: "20:00",
  minEmployees: 1, maxEmployees: null, maxSimultaneous: null, ...o,
});

const emp = (o: Partial<SolverEmployee> = {}): SolverEmployee => ({
  id: "e", firstName: "Bob", lastName: "B", weeklyHours: 35, contractType: null,
  priority: 1, maxHoursPerDay: 10, maxHoursPerWeek: 48, minRestBetween: 11,
  skills: [], preferredStoreId: null, shiftPreference: "JOURNEE", costPerHour: 20,
  unavailabilities: [], reliabilityScore: 90, profileCategory: "A", ...o,
});

const store = (id: string, o: Partial<SolverStore> = {}): SolverStore => ({
  id, name: `Store-${id}`, minEmployees: 1, maxEmployees: null, needsManager: false,
  allowOverlap: false, maxOverlapMinutes: 0, maxSimultaneous: 5,
  schedules: new Map([[DOW, sched()]]),
  importance: 2, ...o,
});

const input = (s: SolverStore, employees: SolverEmployee[]): SolverInput => ({
  store: s, employees, existingShifts: [],
  weekDays: [{ date: DATE, dayOfWeek: DOW, schedule: sched() }],
  options: { mode: "preview", shiftDurationHours: 7, shiftGranularity: 30 },
});

const gShift = (o: Partial<GeneratedShift>): GeneratedShift => ({
  employeeId: null, employeeName: "", storeId: "A", storeName: "Store-A",
  date: DATE, startTime: "09:00", endTime: "12:00", hours: 3, breakMinutes: 0,
  warnings: [], assignmentReason: null, slotPhase: "MILIEU",
  hoursAdjustedReason: null, mergedFromSlots: 1, ...o,
});

const result = (shifts: GeneratedShift[]): SolverResult => ({
  shifts, warnings: [], coverageGaps: [],
  stats: {
    totalShiftsGenerated: shifts.length, assignedCount: 0, unassignedCount: 0,
    totalHoursGenerated: 0, daysFullyCovered: 0, daysPartiallyCovered: 0,
    daysUncovered: 0, employeesUsed: 0, solveTimeMs: 0,
  },
});

// Store A a un creneau non assigne ; Bob est rattache a B mais autorise pour A.
const storeA = store("A");
const storeB = store("B");
const bob = emp({ id: "bob", firstName: "Bob" });
// inputB en premier -> magasin primaire de Bob = B
const inputsBthenA = (bobOverrides: Partial<SolverEmployee> = {}) => [
  input(storeB, [emp({ ...bob, ...bobOverrides })]),
  input(storeA, [emp({ ...bob, ...bobOverrides })]),
];

describe("generateCrossStoreSuggestions", () => {
  it("retourne [] avec moins de 2 magasins", () => {
    expect(generateCrossStoreSuggestions(result([gShift({})]), [input(storeA, [bob])])).toEqual([]);
  });

  it("retourne [] sans shift non assigne", () => {
    const assigned = gShift({ employeeId: "x", storeId: "A" });
    expect(generateCrossStoreSuggestions(result([assigned]), inputsBthenA())).toEqual([]);
  });

  it("propose un employe d'un autre magasin pour couvrir le creneau", () => {
    const out = generateCrossStoreSuggestions(result([gShift({ storeId: "A" })]), inputsBthenA());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "MOVE_EMPLOYEE",
      employeeId: "bob",
      fromStoreId: "B",
      toStoreId: "A",
      date: DATE,
    });
  });

  it("ignore un employe non autorise sur le magasin cible", () => {
    // Bob n'apparait que dans B (pas dans les employes autorises de A)
    const inputs = [input(storeB, [bob]), input(storeA, [emp({ id: "other" })])];
    // 'other' a A comme magasin primaire -> meme magasin que le creneau -> exclu
    expect(generateCrossStoreSuggestions(result([gShift({ storeId: "A" })]), inputs)).toEqual([]);
  });

  it("ignore un employe au plafond hebdomadaire", () => {
    // Bob a deja 46h ; +3h depasserait maxHoursPerWeek=48
    const filler = gShift({ employeeId: "bob", storeId: "B", startTime: "08:00", endTime: "08:00", hours: 46 });
    const out = generateCrossStoreSuggestions(
      result([gShift({ storeId: "A" }), filler]),
      inputsBthenA()
    );
    expect(out).toEqual([]);
  });

  it("ignore un employe indisponible (indispo FIXE chevauchante)", () => {
    const indispo: SolverUnavailability = { type: "FIXED", dayOfWeek: DOW, date: null, startTime: "08:00", endTime: "13:00" };
    const out = generateCrossStoreSuggestions(
      result([gShift({ storeId: "A", startTime: "09:00", endTime: "12:00" })]),
      inputsBthenA({ unavailabilities: [indispo] })
    );
    expect(out).toEqual([]);
  });

  it("ignore un employe en conflit avec son propre shift le meme jour", () => {
    // Bob a deja un shift 09:00-12:00 (sur B) chevauchant le creneau non assigne de A
    const own = gShift({ employeeId: "bob", storeId: "B", startTime: "09:00", endTime: "12:00", hours: 3 });
    const out = generateCrossStoreSuggestions(
      result([gShift({ storeId: "A", startTime: "09:00", endTime: "12:00" }), own]),
      inputsBthenA()
    );
    expect(out).toEqual([]);
  });
});

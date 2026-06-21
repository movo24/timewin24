import {
  isNoOverlap,
  isAvailable,
  isUnderDailyMax,
  isUnderWeeklyMax,
  hasEnoughRest,
  isShiftPreferenceCompatible,
  isStoreOverlapCompliant,
  isUnderMaxDistinctEmployees,
  isUnderMaxSimultaneous,
  isProfileSafeForSlot,
} from "@/lib/solver/constraints";
import type {
  EmployeeState,
  SolverShift,
  SolverExistingShift,
  SolverUnavailability,
  SolverEmployee,
} from "@/lib/solver/types";

const emp = (profile: "A" | "B" | "C" | null): SolverEmployee => ({
  id: "e1", firstName: "X", lastName: "Y", weeklyHours: 35, contractType: "CDI",
  priority: 1, maxHoursPerDay: 10, maxHoursPerWeek: 48, minRestBetween: 11,
  skills: [], preferredStoreId: null, shiftPreference: "JOURNEE", costPerHour: null,
  unavailabilities: [], reliabilityScore: null, profileCategory: profile,
});

// M116 — couverture des contraintes dures du solveur (règles légales/métier).
// Fichier pur (types only) → testable directement, zéro DB.

const shift = (o: Partial<SolverShift>): SolverShift => ({
  employeeId: "e1",
  storeId: "s1",
  date: "2026-06-22",
  startTime: "09:00",
  endTime: "17:00",
  hours: 8,
  ...o,
});

const existing = (o: Partial<SolverExistingShift>): SolverExistingShift => ({
  id: "x1",
  employeeId: "e1",
  storeId: "s1",
  date: "2026-06-22",
  startTime: "09:00",
  endTime: "17:00",
  ...o,
});

const state = (o: Partial<EmployeeState>): EmployeeState => ({
  weeklyHoursAssigned: 0,
  dailyHours: new Map(),
  shifts: [],
  ...o,
});

describe("isNoOverlap (M004 — pas de double-booking)", () => {
  it("détecte un chevauchement avec un shift existant", () => {
    const ex = [existing({ startTime: "08:00", endTime: "12:00" })];
    expect(isNoOverlap("e1", "2026-06-22", "11:00", "15:00", ex, [])).toBe(false);
  });

  it("détecte un chevauchement avec un shift déjà généré", () => {
    const gen = [shift({ startTime: "08:00", endTime: "12:00" })];
    expect(isNoOverlap("e1", "2026-06-22", "11:00", "15:00", [], gen)).toBe(false);
  });

  it("autorise des créneaux adjacents (12:00→12:00)", () => {
    const ex = [existing({ startTime: "08:00", endTime: "12:00" })];
    expect(isNoOverlap("e1", "2026-06-22", "12:00", "16:00", ex, [])).toBe(true);
  });

  it("ignore les shifts d'un autre employé", () => {
    const ex = [existing({ employeeId: "e2", startTime: "08:00", endTime: "18:00" })];
    expect(isNoOverlap("e1", "2026-06-22", "09:00", "17:00", ex, [])).toBe(true);
  });

  it("ignore les shifts d'une autre date", () => {
    const ex = [existing({ date: "2026-06-23", startTime: "08:00", endTime: "18:00" })];
    expect(isNoOverlap("e1", "2026-06-22", "09:00", "17:00", ex, [])).toBe(true);
  });
});

describe("isAvailable (M006 — indisponibilités)", () => {
  const fixedFullDay: SolverUnavailability = {
    type: "FIXED", dayOfWeek: 1, date: null, startTime: null, endTime: null,
  };
  const fixedPartial: SolverUnavailability = {
    type: "FIXED", dayOfWeek: 1, date: null, startTime: "08:00", endTime: "12:00",
  };
  const variableFullDay: SolverUnavailability = {
    type: "VARIABLE", dayOfWeek: null, date: "2026-06-22", startTime: null, endTime: null,
  };

  it("FIXED jour entier sur le bon jour → indisponible", () => {
    expect(isAvailable([fixedFullDay], "2026-06-22", 1, "09:00", "17:00")).toBe(false);
  });

  it("FIXED partiel qui chevauche → indisponible", () => {
    expect(isAvailable([fixedPartial], "2026-06-22", 1, "10:00", "14:00")).toBe(false);
  });

  it("FIXED partiel sans chevauchement → disponible", () => {
    expect(isAvailable([fixedPartial], "2026-06-22", 1, "13:00", "17:00")).toBe(true);
  });

  it("FIXED ne s'applique pas à un autre jour de semaine", () => {
    expect(isAvailable([fixedFullDay], "2026-06-23", 2, "09:00", "17:00")).toBe(true);
  });

  it("VARIABLE jour entier sur la bonne date → indisponible", () => {
    expect(isAvailable([variableFullDay], "2026-06-22", 1, "09:00", "17:00")).toBe(false);
  });

  it("VARIABLE ne s'applique pas à une autre date", () => {
    expect(isAvailable([variableFullDay], "2026-06-23", 2, "09:00", "17:00")).toBe(true);
  });

  it("aucune indisponibilité → disponible", () => {
    expect(isAvailable([], "2026-06-22", 1, "09:00", "17:00")).toBe(true);
  });
});

describe("isUnderDailyMax / isUnderWeeklyMax (limites légales FR)", () => {
  it("journalier : 6h déjà + 4h ≤ 10h → ok", () => {
    const s = state({ dailyHours: new Map([["2026-06-22", 6]]) });
    expect(isUnderDailyMax(s, "2026-06-22", 4, 10)).toBe(true);
  });
  it("journalier : 8h déjà + 4h > 10h → refusé", () => {
    const s = state({ dailyHours: new Map([["2026-06-22", 8]]) });
    expect(isUnderDailyMax(s, "2026-06-22", 4, 10)).toBe(false);
  });
  it("hebdo : 30h + 8h ≤ 40h → ok", () => {
    expect(isUnderWeeklyMax(state({ weeklyHoursAssigned: 30 }), 8, 40)).toBe(true);
  });
  it("hebdo : 36h + 8h > 40h → refusé", () => {
    expect(isUnderWeeklyMax(state({ weeklyHoursAssigned: 36 }), 8, 40)).toBe(false);
  });
});

describe("hasEnoughRest (repos min 11h — droit du travail FR)", () => {
  it("10h de repos entre 2 jours < 11h → refusé", () => {
    // shift existant finit le 22 à 22:00, proposé le 23 à 08:00 = 10h
    const s = state({ shifts: [shift({ date: "2026-06-22", startTime: "14:00", endTime: "22:00" })] });
    expect(hasEnoughRest(s, "2026-06-23", "08:00", "16:00", 11)).toBe(false);
  });

  it("14h de repos entre 2 jours ≥ 11h → ok", () => {
    const s = state({ shifts: [shift({ date: "2026-06-22", startTime: "10:00", endTime: "18:00" })] });
    expect(hasEnoughRest(s, "2026-06-23", "08:00", "16:00", 11)).toBe(true);
  });

  it("gap inverse (proposé AVANT l'existant le même jour) < 11h → refusé", () => {
    // proposé finit 12:00, existant commence 14:00 → 2h
    const s = state({ shifts: [shift({ date: "2026-06-22", startTime: "14:00", endTime: "22:00" })] });
    expect(hasEnoughRest(s, "2026-06-22", "08:00", "12:00", 11)).toBe(false);
  });
});

describe("isShiftPreferenceCompatible (magasin 08:00–20:00, milieu 14:00)", () => {
  it("JOURNEE accepte tout créneau", () => {
    expect(isShiftPreferenceCompatible("JOURNEE", "08:00", "20:00", "08:00", "20:00")).toBe(true);
  });
  it("MATIN : doit finir avant le milieu (+30min)", () => {
    expect(isShiftPreferenceCompatible("MATIN", "08:00", "12:00", "08:00", "20:00")).toBe(true);
    expect(isShiftPreferenceCompatible("MATIN", "13:00", "17:00", "08:00", "20:00")).toBe(false);
  });
  it("APRES_MIDI : doit commencer après le milieu (−30min)", () => {
    expect(isShiftPreferenceCompatible("APRES_MIDI", "15:00", "20:00", "08:00", "20:00")).toBe(true);
    expect(isShiftPreferenceCompatible("APRES_MIDI", "08:00", "12:00", "08:00", "20:00")).toBe(false);
  });
});

describe("isStoreOverlapCompliant (relais entre collègues)", () => {
  const other = [existing({ employeeId: "e2", startTime: "08:00", endTime: "12:00" })];
  it("chevauchement > maxOverlap → refusé", () => {
    expect(isStoreOverlapCompliant("s1", "2026-06-22", "11:00", "15:00", "e1", 0, other, [])).toBe(false);
  });
  it("relais adjacent (0 chevauchement) → ok", () => {
    expect(isStoreOverlapCompliant("s1", "2026-06-22", "12:00", "16:00", "e1", 0, other, [])).toBe(true);
  });
  it("chevauchement ≤ maxOverlap toléré → ok", () => {
    expect(isStoreOverlapCompliant("s1", "2026-06-22", "11:00", "15:00", "e1", 60, other, [])).toBe(true);
  });
  it("ignore ses propres shifts", () => {
    const mine = [existing({ employeeId: "e1", startTime: "08:00", endTime: "18:00" })];
    expect(isStoreOverlapCompliant("s1", "2026-06-22", "09:00", "17:00", "e1", 0, mine, [])).toBe(true);
  });
});

describe("isUnderMaxDistinctEmployees", () => {
  const two = [
    existing({ employeeId: "e2", id: "a" }),
    existing({ employeeId: "e3", id: "b" }),
  ];
  it("null = illimité", () => {
    expect(isUnderMaxDistinctEmployees("e1", "s1", "2026-06-22", null, two, [])).toBe(true);
  });
  it("refuse un nouvel employé au-delà de la limite", () => {
    expect(isUnderMaxDistinctEmployees("e1", "s1", "2026-06-22", 2, two, [])).toBe(false);
  });
  it("autorise sous la limite", () => {
    const one = [existing({ employeeId: "e2", id: "a" })];
    expect(isUnderMaxDistinctEmployees("e1", "s1", "2026-06-22", 2, one, [])).toBe(true);
  });
  it("un employé déjà présent ne compte pas en plus", () => {
    expect(isUnderMaxDistinctEmployees("e2", "s1", "2026-06-22", 2, two, [])).toBe(true);
  });
});

describe("isUnderMaxSimultaneous (sweep-line, relais exact = 1)", () => {
  it("refuse un chevauchement qui dépasse le max simultané", () => {
    const ex = [existing({ employeeId: "e2", startTime: "09:00", endTime: "17:00" })];
    expect(isUnderMaxSimultaneous("s1", "2026-06-22", "11:00", "15:00", 1, ex, [])).toBe(false);
  });
  it("autorise un relais exact (A finit 12:00, B démarre 12:00)", () => {
    const ex = [existing({ employeeId: "e2", startTime: "09:00", endTime: "12:00" })];
    expect(isUnderMaxSimultaneous("s1", "2026-06-22", "12:00", "15:00", 1, ex, [])).toBe(true);
  });
});

describe("isProfileSafeForSlot (Manager Brain — profil C non seul)", () => {
  it("C seul à l'ouverture → bloqué", () => {
    expect(isProfileSafeForSlot(emp("C"), "OUVERTURE", 2, [])).toBe(false);
  });
  it("C seul à la fermeture → bloqué", () => {
    expect(isProfileSafeForSlot(emp("C"), "FERMETURE", 2, [])).toBe(false);
  });
  it("C seul sur magasin critique → bloqué", () => {
    expect(isProfileSafeForSlot(emp("C"), "MILIEU", 1, [])).toBe(false);
  });
  it("C uniquement avec d'autres C → bloqué", () => {
    expect(isProfileSafeForSlot(emp("C"), "MILIEU", 2, [emp("C")])).toBe(false);
  });
  it("C accompagné d'un B à l'ouverture → ok", () => {
    expect(isProfileSafeForSlot(emp("C"), "OUVERTURE", 2, [emp("B")])).toBe(true);
  });
  it("profil A seul à l'ouverture → ok", () => {
    expect(isProfileSafeForSlot(emp("A"), "OUVERTURE", 1, [])).toBe(true);
  });
});

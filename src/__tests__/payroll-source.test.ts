import {
  workedFactsFromClockIns,
  latenessFromClockIns,
  absenceFactsFromDeclarations,
} from "@/lib/payroll/source";

// Paie — adaptateur source Étage 1 -> Étage 2. Conversion pure des faits bruts
// (ClockIn / AbsenceDeclaration) en faits qualifies. Aucun montant.

const dt = (iso: string) => new Date(iso);

describe("workedFactsFromClockIns", () => {
  it("derive date/heures d'un pointage complet", () => {
    const facts = workedFactsFromClockIns([
      { clockInAt: dt("2026-06-22T09:00:00Z"), clockOutAt: dt("2026-06-22T17:30:00Z") },
    ]);
    expect(facts).toEqual([{ date: "2026-06-22", startTime: "09:00", endTime: "17:30" }]);
  });
  it("exclut un pointage incomplet (sans clockOut)", () => {
    expect(workedFactsFromClockIns([{ clockInAt: dt("2026-06-22T09:00:00Z"), clockOutAt: null }])).toEqual([]);
  });
});

describe("latenessFromClockIns", () => {
  it("ne retient que les retards effectifs (status LATE + minutes > 0)", () => {
    const facts = latenessFromClockIns([
      { clockInAt: dt("2026-06-22T09:10:00Z"), clockOutAt: dt("2026-06-22T17:00:00Z"), status: "LATE", lateMinutes: 10 },
      { clockInAt: dt("2026-06-23T09:00:00Z"), clockOutAt: dt("2026-06-23T17:00:00Z"), status: "ON_TIME", lateMinutes: 0 },
      { clockInAt: dt("2026-06-24T09:00:00Z"), clockOutAt: null, status: "LATE", lateMinutes: 0 },
    ]);
    expect(facts).toEqual([{ date: "2026-06-22", minutes: 10 }]);
  });
});

describe("absenceFactsFromDeclarations", () => {
  it("etend un intervalle en un fait par jour calendaire", () => {
    const facts = absenceFactsFromDeclarations([
      { type: "CONGE", startDate: dt("2026-06-22T00:00:00Z"), endDate: dt("2026-06-24T00:00:00Z"), status: "APPROVED" },
    ]);
    expect(facts).toEqual([
      { date: "2026-06-22", kind: "CONGE" },
      { date: "2026-06-23", kind: "CONGE" },
      { date: "2026-06-24", kind: "CONGE" },
    ]);
  });
  it("ignore les declarations non approuvees", () => {
    expect(
      absenceFactsFromDeclarations([
        { type: "MALADIE", startDate: dt("2026-06-22T00:00:00Z"), endDate: dt("2026-06-22T00:00:00Z"), status: "PENDING" },
      ])
    ).toEqual([]);
  });
  it("mappe un type inconnu vers AUTRE (jamais ignore en silence)", () => {
    const facts = absenceFactsFromDeclarations([
      { type: "XYZ", startDate: dt("2026-06-22T00:00:00Z"), endDate: dt("2026-06-22T00:00:00Z"), status: "APPROVED" },
    ]);
    expect(facts).toEqual([{ date: "2026-06-22", kind: "AUTRE" }]);
  });
  it("intervalle inverse -> aucun jour", () => {
    expect(
      absenceFactsFromDeclarations([
        { type: "CONGE", startDate: dt("2026-06-24T00:00:00Z"), endDate: dt("2026-06-22T00:00:00Z"), status: "APPROVED" },
      ])
    ).toEqual([]);
  });
});

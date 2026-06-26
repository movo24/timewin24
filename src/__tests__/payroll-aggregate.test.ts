import { aggregatePayrollInputs } from "@/lib/payroll/aggregate";
import type { PayrollAggregationInput } from "@/lib/payroll/types";

// Paie / Étage 2 — agregation mensuelle des variables de paie (QUANTITES).
// On verifie le comptage et la qualification, jamais une valorisation.

const base: PayrollAggregationInput = {
  contractWeeklyHours: 35,
  worked: [],
  absences: [],
  lateness: [],
};

describe("aggregatePayrollInputs", () => {
  it("entree vide -> tout a zero", () => {
    const r = aggregatePayrollInputs(base);
    expect(r.totalWorkedHours).toBe(0);
    expect(r.normalHours).toBe(0);
    expect(r.overtimeHours).toBe(0);
    expect(r.complementaryHours).toBe(0);
    expect(r.latenessMinutes).toBe(0);
    expect(r.absenceDays).toEqual({ MALADIE: 0, CONGE: 0, PERSONNEL: 0, ACCIDENT: 0, AUTRE: 0 });
  });

  it("somme les heures travaillees et qualifie les heures sup par semaine", () => {
    // Semaine du 22 juin 2026 (lundi) : 5 jours x 8h = 40h -> 35 normal + 5 sup
    const worked = ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"].map((date) => ({
      date, startTime: "09:00", endTime: "17:00",
    }));
    const r = aggregatePayrollInputs({ ...base, worked });
    expect(r.totalWorkedHours).toBe(40);
    expect(r.normalHours).toBe(35);
    expect(r.overtimeHours).toBe(5);
  });

  it("qualifie dimanche et jour ferie comme sous-ensembles des heures", () => {
    const worked = [
      { date: "2026-06-21", startTime: "09:00", endTime: "13:00" }, // dimanche 4h
      { date: "2026-07-14", startTime: "10:00", endTime: "14:00" }, // ferie 4h
      { date: "2026-06-22", startTime: "09:00", endTime: "17:00" }, // lundi 8h
    ];
    const r = aggregatePayrollInputs({ ...base, worked });
    expect(r.sundayHours).toBe(4);
    expect(r.holidayHours).toBe(4);
    expect(r.totalWorkedHours).toBe(16);
  });

  it("qualifie les heures complementaires d'un temps partiel", () => {
    // contrat 24h, semaine de 30h -> 24 normal + 6 complementaires
    const worked = ["2026-06-22", "2026-06-23", "2026-06-24"].map((date) => ({
      date, startTime: "09:00", endTime: "19:00", // 10h/jour x3 = 30h
    }));
    const r = aggregatePayrollInputs({ contractWeeklyHours: 24, worked, absences: [], lateness: [] });
    expect(r.totalWorkedHours).toBe(30);
    expect(r.normalHours).toBe(24);
    expect(r.complementaryHours).toBe(6);
    expect(r.overtimeHours).toBe(0);
  });

  it("compte les absences par type et derive conges/arrets/autres", () => {
    const absences = [
      { date: "2026-06-22", kind: "CONGE" as const },
      { date: "2026-06-23", kind: "CONGE" as const },
      { date: "2026-06-24", kind: "MALADIE" as const },
      { date: "2026-06-25", kind: "ACCIDENT" as const },
      { date: "2026-06-26", kind: "PERSONNEL" as const },
    ];
    const r = aggregatePayrollInputs({ ...base, absences });
    expect(r.absenceDays.CONGE).toBe(2);
    expect(r.paidLeaveDays).toBe(2);
    expect(r.sickOrAccidentDays).toBe(2); // MALADIE + ACCIDENT
    expect(r.otherAbsenceDays).toBe(1); // PERSONNEL
  });

  it("somme les minutes de retard (ignore les valeurs negatives)", () => {
    const lateness = [
      { date: "2026-06-22", minutes: 10 },
      { date: "2026-06-23", minutes: 5 },
      { date: "2026-06-24", minutes: -3 },
    ];
    expect(aggregatePayrollInputs({ ...base, lateness }).latenessMinutes).toBe(15);
  });

  it("qualifie les heures sup separement par semaine (pas de fusion inter-semaines)", () => {
    // 2 semaines de 40h chacune -> 2 x (35 normal + 5 sup) = 70 normal + 10 sup
    const week1 = ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"];
    const week2 = ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"];
    const worked = [...week1, ...week2].map((date) => ({ date, startTime: "09:00", endTime: "17:00" }));
    const r = aggregatePayrollInputs({ ...base, worked });
    expect(r.normalHours).toBe(70);
    expect(r.overtimeHours).toBe(10);
  });
});

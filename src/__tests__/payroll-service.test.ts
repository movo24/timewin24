import { buildPayrollPreview } from "@/lib/payroll/service";
import type { PayrollKey } from "@/lib/payroll/types";

// Paie — orchestration pure (source + aggregate + export). De lignes brutes
// (ClockIn/Absence) aux variables de paie + ligne d'export. Aucune valorisation.

const KEY: PayrollKey = {
  companySiren: "123456789",
  establishmentSiret: "12345678900012",
  contractId: "EMP-1",
  period: "2026-06",
};
const dt = (iso: string) => new Date(iso);

describe("buildPayrollPreview", () => {
  it("assemble pointages + absences en variables + ligne d'export", () => {
    // Semaine du 22 juin : 5 jours x 8h = 40h -> 35 normal + 5 sup ; 1 retard 10 min ; 1 jour CONGE
    const clockIns = ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"].map((d, i) => ({
      clockInAt: dt(`${d}T09:0${i === 0 ? 5 : 0}:00Z`),
      clockOutAt: dt(`${d}T17:0${i === 0 ? 5 : 0}:00Z`),
      status: i === 0 ? "LATE" : "ON_TIME",
      lateMinutes: i === 0 ? 10 : 0,
    }));
    const absences = [
      { type: "CONGE", startDate: dt("2026-06-29T00:00:00Z"), endDate: dt("2026-06-29T00:00:00Z"), status: "APPROVED" },
    ];

    const out = buildPayrollPreview({ key: KEY, contractWeeklyHours: 35, clockIns, absences });

    expect(out.variables.totalWorkedHours).toBe(40);
    expect(out.variables.normalHours).toBe(35);
    expect(out.variables.overtimeHours).toBe(5);
    expect(out.variables.latenessMinutes).toBe(10);
    expect(out.variables.paidLeaveDays).toBe(1);
    // ligne d'export reflète la clé + les quantités
    expect(out.exportRow.contractId).toBe("EMP-1");
    expect(out.exportRow.period).toBe("2026-06");
    expect(out.exportRow.overtimeHours).toBe(5);
    expect(out.exportRow.paidLeaveDays).toBe(1);
  });

  it("entrées vides -> variables à zéro", () => {
    const out = buildPayrollPreview({ key: KEY, contractWeeklyHours: 35, clockIns: [], absences: [] });
    expect(out.variables.totalWorkedHours).toBe(0);
    expect(out.variables.overtimeHours).toBe(0);
  });
});

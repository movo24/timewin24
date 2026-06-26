import {
  toExportRow,
  toCsv,
  toJsonExport,
  exportChecksum,
  PAYROLL_EXPORT_COLUMNS,
} from "@/lib/payroll/export";
import type { PayrollInputVariables, PayrollKey } from "@/lib/payroll/types";

// Paie / Étage 3 — export ABSTRAIT (CSV/JSON) + checksum. Aucun montant, aucun
// format editeur concret (Tier-2). On verifie le contrat de serialisation.

const KEY: PayrollKey = {
  companySiren: "123456789",
  establishmentSiret: "12345678900012",
  contractId: "CTR-1",
  period: "2026-06",
};

const VARS: PayrollInputVariables = {
  totalWorkedHours: 151.67,
  normalHours: 140,
  overtimeHours: 11.67,
  complementaryHours: 0,
  sundayHours: 7,
  holidayHours: 4,
  absenceDays: { MALADIE: 1, CONGE: 2, PERSONNEL: 0, ACCIDENT: 0, AUTRE: 0 },
  paidLeaveDays: 2,
  sickOrAccidentDays: 1,
  otherAbsenceDays: 0,
  latenessMinutes: 15,
};

describe("toExportRow", () => {
  it("aplatit cle + quantites en une ligne abstraite", () => {
    const row = toExportRow(KEY, VARS);
    expect(row.companySiren).toBe("123456789");
    expect(row.establishmentSiret).toBe("12345678900012");
    expect(row.contractId).toBe("CTR-1");
    expect(row.period).toBe("2026-06");
    expect(row.overtimeHours).toBe(11.67);
    expect(row.paidLeaveDays).toBe(2);
    expect(row.latenessMinutes).toBe(15);
  });
  it("rend les SIREN/SIRET nuls en chaine vide", () => {
    const row = toExportRow({ ...KEY, companySiren: null, establishmentSiret: null }, VARS);
    expect(row.companySiren).toBe("");
    expect(row.establishmentSiret).toBe("");
  });
});

describe("toCsv", () => {
  it("genere un en-tete stable + une ligne de donnees", () => {
    const csv = toCsv([toExportRow(KEY, VARS)]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(PAYROLL_EXPORT_COLUMNS.join(","));
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith("123456789,12345678900012,CTR-1,2026-06,")).toBe(true);
  });
  it("echappe une cellule contenant une virgule", () => {
    const row = toExportRow({ ...KEY, contractId: "CTR,1" }, VARS);
    const csv = toCsv([row]);
    expect(csv).toContain('"CTR,1"');
  });
});

describe("toJsonExport", () => {
  it("serialise un tableau d'objets a cles ordonnees", () => {
    const json = JSON.parse(toJsonExport([toExportRow(KEY, VARS)]));
    expect(json).toHaveLength(1);
    expect(Object.keys(json[0])).toEqual([...PAYROLL_EXPORT_COLUMNS]);
  });
});

describe("exportChecksum", () => {
  it("est deterministe et sensible au contenu", () => {
    const a = toCsv([toExportRow(KEY, VARS)]);
    expect(exportChecksum(a)).toBe(exportChecksum(a));
    expect(exportChecksum(a)).toHaveLength(64); // sha256 hex
    const b = toCsv([toExportRow({ ...KEY, period: "2026-07" }, VARS)]);
    expect(exportChecksum(a)).not.toBe(exportChecksum(b));
  });
});

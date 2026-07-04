import { computeEaster, frenchHolidays, isFrenchHoliday } from "@/lib/payroll/holidays";

// Paie / Étage 2 — calendrier des jours fériés français (qualification pure,
// aucune valorisation). Dates de Pâques verifiees contre des references connues.

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

describe("computeEaster", () => {
  it("calcule le dimanche de Paques (references connues)", () => {
    expect(ymd(computeEaster(2026))).toBe("2026-04-05");
    expect(ymd(computeEaster(2024))).toBe("2024-03-31");
    expect(ymd(computeEaster(2025))).toBe("2025-04-20");
  });
});

describe("frenchHolidays", () => {
  it("contient les 11 jours feries legaux", () => {
    expect(frenchHolidays(2026).size).toBe(11);
  });

  it("inclut les feries fixes", () => {
    const h = frenchHolidays(2026);
    for (const d of ["2026-01-01", "2026-05-01", "2026-05-08", "2026-07-14", "2026-08-15", "2026-11-01", "2026-11-11", "2026-12-25"]) {
      expect(h.has(d)).toBe(true);
    }
  });

  it("inclut les feries mobiles bases sur Paques (2026)", () => {
    const h = frenchHolidays(2026);
    expect(h.has("2026-04-06")).toBe(true); // Lundi de Paques (Paques + 1)
    expect(h.has("2026-05-14")).toBe(true); // Ascension (Paques + 39)
    expect(h.has("2026-05-25")).toBe(true); // Lundi de Pentecote (Paques + 50)
  });
});

describe("isFrenchHoliday", () => {
  it("reconnait un ferie et rejette un jour ordinaire", () => {
    expect(isFrenchHoliday("2026-07-14")).toBe(true);
    expect(isFrenchHoliday("2026-07-15")).toBe(false);
  });
  it("gere une date invalide sans planter", () => {
    expect(isFrenchHoliday("not-a-date")).toBe(false);
  });
});

import { validateContractPatch, CONTRACT_TYPES, MAX_WEEKLY_HOURS } from "@/lib/payroll/contract";

// Paie / Étage 2 — validation PURE d'un patch de contrat. Coherence
// administrative (type, base horaire, dates). Aucune valorisation.

describe("validateContractPatch", () => {
  it("accepte un patch complet valide", () => {
    const r = validateContractPatch({ contractType: "CDD", weeklyHours: 30, startDate: "2026-01-06", endDate: "2026-06-30" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ contractType: "CDD", weeklyHours: 30, startDate: "2026-01-06", endDate: "2026-06-30" });
  });

  it("ignore les champs absents (patch partiel)", () => {
    const r = validateContractPatch({ weeklyHours: 35 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ weeklyHours: 35 });
  });

  it("accepte tous les types de contrat connus", () => {
    for (const t of CONTRACT_TYPES) {
      expect(validateContractPatch({ contractType: t }).ok).toBe(true);
    }
  });

  it("refuse un type de contrat inconnu", () => {
    const r = validateContractPatch({ contractType: "FREELANCE" });
    expect(r.ok).toBe(false);
  });

  it("refuse des heures hors bornes", () => {
    expect(validateContractPatch({ weeklyHours: 0 }).ok).toBe(false);
    expect(validateContractPatch({ weeklyHours: MAX_WEEKLY_HOURS + 1 }).ok).toBe(false);
    expect(validateContractPatch({ weeklyHours: Number.NaN }).ok).toBe(false);
  });

  it("convertit une chaine d'heures numerique", () => {
    const r = validateContractPatch({ weeklyHours: "24" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.weeklyHours).toBe(24);
  });

  it("refuse une date mal formee ou inexistante", () => {
    expect(validateContractPatch({ startDate: "06/01/2026" }).ok).toBe(false);
    expect(validateContractPatch({ startDate: "2026-02-30" }).ok).toBe(false); // 30 fevrier
  });

  it("autorise endDate null/vide (contrat ouvert)", () => {
    const r1 = validateContractPatch({ endDate: null });
    const r2 = validateContractPatch({ endDate: "" });
    expect(r1.ok && r1.value.endDate === null).toBe(true);
    expect(r2.ok && r2.value.endDate === null).toBe(true);
  });

  it("refuse une fin anterieure au debut (dans le meme patch)", () => {
    const r = validateContractPatch({ startDate: "2026-06-30", endDate: "2026-01-06" });
    expect(r.ok).toBe(false);
  });
});

/**
 * Validation PURE d'une modification de contrat de travail (Étage 2).
 *
 * On valide la cohérence administrative du contrat (type, base horaire,
 * dates). Aucune valorisation : la base horaire est une QUANTITÉ contractuelle,
 * pas un montant.
 */

export const CONTRACT_TYPES = ["CDI", "CDD", "INTERIM", "EXTRA", "STAGE"] as const;
export type ContractTypeValue = (typeof CONTRACT_TYPES)[number];

/** Base hebdomadaire admissible (heures contractuelles). */
export const MIN_WEEKLY_HOURS = 1;
export const MAX_WEEKLY_HOURS = 48; // plafond légal hebdomadaire FR

export interface ContractPatchInput {
  contractType?: unknown;
  weeklyHours?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

export interface ContractPatchValue {
  contractType?: ContractTypeValue;
  weeklyHours?: number;
  startDate?: string; // "YYYY-MM-DD"
  endDate?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Valide un patch partiel de contrat. Renvoie la valeur normalisée ou une
 * erreur explicite. Les champs absents (`undefined`) sont ignorés.
 */
export function validateContractPatch(
  input: ContractPatchInput
): { ok: true; value: ContractPatchValue } | { ok: false; error: string } {
  const value: ContractPatchValue = {};

  if (input.contractType !== undefined) {
    if (typeof input.contractType !== "string" || !CONTRACT_TYPES.includes(input.contractType as ContractTypeValue)) {
      return { ok: false, error: `Type de contrat invalide (attendu : ${CONTRACT_TYPES.join(", ")})` };
    }
    value.contractType = input.contractType as ContractTypeValue;
  }

  if (input.weeklyHours !== undefined) {
    const h = typeof input.weeklyHours === "string" ? Number(input.weeklyHours) : (input.weeklyHours as number);
    if (typeof h !== "number" || !Number.isFinite(h) || h < MIN_WEEKLY_HOURS || h > MAX_WEEKLY_HOURS) {
      return { ok: false, error: `Heures hebdomadaires invalides (${MIN_WEEKLY_HOURS}–${MAX_WEEKLY_HOURS})` };
    }
    value.weeklyHours = h;
  }

  if (input.startDate !== undefined) {
    if (typeof input.startDate !== "string" || !isRealDate(input.startDate)) {
      return { ok: false, error: "Date de début invalide (format AAAA-MM-JJ attendu)" };
    }
    value.startDate = input.startDate;
  }

  if (input.endDate !== undefined) {
    if (input.endDate === null || input.endDate === "") {
      value.endDate = null;
    } else if (typeof input.endDate !== "string" || !isRealDate(input.endDate)) {
      return { ok: false, error: "Date de fin invalide (format AAAA-MM-JJ attendu)" };
    } else {
      value.endDate = input.endDate;
    }
  }

  // Cohérence : fin >= début lorsque les deux sont connus dans ce patch.
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    return { ok: false, error: "La date de fin doit être postérieure ou égale à la date de début" };
  }

  return { ok: true, value };
}

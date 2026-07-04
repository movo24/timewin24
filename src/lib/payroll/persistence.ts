/**
 * Cycle de vie des variables de paie persistées (Étage 2) — logique PURE.
 *
 * Statuts : draft → validated → locked.
 *  - draft     : recalculable / réécrasable à volonté.
 *  - validated : figé pour relecture ; réouvrable en draft ou verrouillable.
 *  - locked    : verrou mensuel — plus aucune réécriture. NON destructif :
 *                les données restent en base (réversibilité = niveau admin/DB,
 *                pas un parcours applicatif).
 *
 * FRONTIÈRE : on gère un statut de QUANTITÉS qualifiées, jamais une valorisation.
 */

export type PayrollInputStatus = "draft" | "validated" | "locked";

const TRANSITIONS: Record<PayrollInputStatus, PayrollInputStatus[]> = {
  draft: ["validated"],
  validated: ["draft", "locked"],
  locked: [],
};

/** Vrai si la transition de statut `from → to` est autorisée. */
export function canTransitionPayrollInput(
  from: PayrollInputStatus,
  to: PayrollInputStatus
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Vrai si une ligne dans cet état peut être (re)calculée / écrasée par
 * l'agrégateur. Seul `draft` est réécrasable : une ligne validée ou verrouillée
 * doit d'abord être rouverte (et `locked` ne se rouvre pas applicativement).
 */
export function isPayrollInputWritable(status: PayrollInputStatus): boolean {
  return status === "draft";
}

/** Statut initial d'une ligne fraîchement calculée. */
export const INITIAL_PAYROLL_STATUS: PayrollInputStatus = "draft";

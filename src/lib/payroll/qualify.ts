/**
 * Qualification des heures (seuils / contingent) — Étage 2.
 *
 * FRONTIÈRE : on QUALIFIE des heures (normales / supplémentaires /
 * complémentaires) via les seuils légaux. On ne valorise rien : aucun taux de
 * majoration (25 %, 50 %…) n'est appliqué ici — c'est le rôle du moteur de paie.
 */
import { LEGAL_WEEKLY_HOURS } from "./types";
import { round2 } from "./hours";

/** Lundi (début de semaine) de la semaine contenant "YYYY-MM-DD". */
export function weekStart(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=dim … 6=sam
  const diff = day === 0 ? -6 : 1 - day; // ramène au lundi
  d.setUTCDate(d.getUTCDate() + diff);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

export interface WeeklyQualification {
  normalHours: number;
  overtimeHours: number;
  complementaryHours: number;
}

/**
 * Qualifie les heures d'UNE semaine selon le contrat.
 *
 *  - Temps plein (contrat ≥ 35 h) :
 *      normal = min(travaillé, 35) ; heures sup = au-delà de 35.
 *  - Temps partiel (contrat < 35 h) :
 *      normal = min(travaillé, contrat) ;
 *      heures complémentaires = de contrat jusqu'à 35 ;
 *      heures sup = au-delà de 35 (cas limite).
 */
export function qualifyWeeklyHours(
  workedHours: number,
  contractWeeklyHours: number
): WeeklyQualification {
  const worked = Math.max(0, workedHours);
  const legal = LEGAL_WEEKLY_HOURS;

  if (contractWeeklyHours >= legal) {
    return {
      normalHours: round2(Math.min(worked, legal)),
      overtimeHours: round2(Math.max(0, worked - legal)),
      complementaryHours: 0,
    };
  }

  // Temps partiel
  const normal = Math.min(worked, contractWeeklyHours);
  const complementary = Math.max(0, Math.min(worked, legal) - contractWeeklyHours);
  const overtime = Math.max(0, worked - legal);
  return {
    normalHours: round2(normal),
    overtimeHours: round2(overtime),
    complementaryHours: round2(complementary),
  };
}

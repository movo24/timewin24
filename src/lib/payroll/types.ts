/**
 * Types du module Payroll Inputs (Étage 2).
 *
 * FRONTIÈRE NON NÉGOCIABLE : ce module manipule des QUANTITÉS qualifiées
 * (heures, jours, minutes) et jamais de montants. Aucune valorisation en euros,
 * aucun taux de majoration, aucune cotisation. La valorisation reste au moteur
 * de paie externe / expert-comptable.
 */

/** Types d'absence (miroir de l'enum Prisma AbsenceType). */
export type AbsenceKind = "MALADIE" | "CONGE" | "PERSONNEL" | "ACCIDENT" | "AUTRE";

/** Un créneau réellement travaillé, déjà validé en amont (pointage ou shift validé). */
export interface WorkedFact {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

/** Un fait de retard qualifié. */
export interface LatenessFact {
  date: string; // "YYYY-MM-DD"
  minutes: number;
}

/** Un jour d'absence qualifié (un enregistrement par jour couvert). */
export interface AbsenceDayFact {
  date: string; // "YYYY-MM-DD"
  kind: AbsenceKind;
}

/** Clé de granularité paie : société × établissement × contrat × période. */
export interface PayrollKey {
  companySiren: string | null;
  establishmentSiret: string | null;
  contractId: string;
  period: string; // "YYYY-MM"
}

/**
 * Variables de paie produites — QUANTITÉS uniquement.
 * Aucune de ces valeurs n'est un montant ; ce sont des heures, des jours ou
 * des minutes destinés à être valorisés par le moteur de paie.
 */
export interface PayrollInputVariables {
  // ─── Heures ───
  totalWorkedHours: number;
  normalHours: number;
  overtimeHours: number; // heures supplémentaires (temps plein, > seuil hebdo légal)
  complementaryHours: number; // heures complémentaires (temps partiel, contrat → seuil légal)

  // ─── Qualifications transverses (sous-ensembles des heures travaillées) ───
  sundayHours: number; // heures tombant un dimanche
  holidayHours: number; // heures tombant un jour férié légal

  // ─── Absences (en jours) ───
  absenceDays: Record<AbsenceKind, number>;
  paidLeaveDays: number; // congés payés (CONGE)
  sickOrAccidentDays: number; // arrêts (MALADIE + ACCIDENT)
  otherAbsenceDays: number; // PERSONNEL + AUTRE

  // ─── Retards ───
  latenessMinutes: number;
}

/** Entrée d'agrégation pour un contrat × période. */
export interface PayrollAggregationInput {
  /** Heures contractuelles hebdomadaires (ex: 35 temps plein, 24 temps partiel). */
  contractWeeklyHours: number;
  worked: WorkedFact[];
  absences: AbsenceDayFact[];
  lateness: LatenessFact[];
}

/** Seuil hebdomadaire légal français de déclenchement des heures supplémentaires. */
export const LEGAL_WEEKLY_HOURS = 35;

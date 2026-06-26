/**
 * Agrégation mensuelle des variables de paie (Étage 2).
 *
 * Produit, pour un contrat × période, les QUANTITÉS qualifiées destinées au
 * moteur de paie. Aucune valorisation, aucun euro.
 *
 * Heures supplémentaires : qualifiées par SEMAINE (seuil hebdo légal) puis
 * sommées sur la période. Limite connue : une semaine à cheval sur deux mois
 * est qualifiée avec les seuls faits fournis par l'appelant (qui borne la
 * période). Raffinement « semaine calendaire complète » documenté en backlog.
 */
import type {
  PayrollAggregationInput,
  PayrollInputVariables,
  AbsenceKind,
} from "./types";
import { intervalHours, isSunday, round2 } from "./hours";
import { isFrenchHoliday } from "./holidays";
import { qualifyWeeklyHours, weekStart } from "./qualify";

const ZERO_ABSENCES: Record<AbsenceKind, number> = {
  MALADIE: 0,
  CONGE: 0,
  PERSONNEL: 0,
  ACCIDENT: 0,
  AUTRE: 0,
};

export function aggregatePayrollInputs(
  input: PayrollAggregationInput
): PayrollInputVariables {
  const { contractWeeklyHours, worked, absences, lateness } = input;

  // ─── Heures par jour + qualifications transverses (dimanche / férié) ───
  const hoursByWeek = new Map<string, number>();
  let totalWorkedHours = 0;
  let sundayHours = 0;
  let holidayHours = 0;

  for (const w of worked) {
    const h = intervalHours(w.startTime, w.endTime);
    totalWorkedHours += h;
    if (isSunday(w.date)) sundayHours += h;
    if (isFrenchHoliday(w.date)) holidayHours += h;
    const wk = weekStart(w.date);
    hoursByWeek.set(wk, (hoursByWeek.get(wk) || 0) + h);
  }

  // ─── Qualification hebdomadaire (normal / sup / complémentaire) ───
  let normalHours = 0;
  let overtimeHours = 0;
  let complementaryHours = 0;
  for (const weekHours of hoursByWeek.values()) {
    const q = qualifyWeeklyHours(weekHours, contractWeeklyHours);
    normalHours += q.normalHours;
    overtimeHours += q.overtimeHours;
    complementaryHours += q.complementaryHours;
  }

  // ─── Absences (en jours, par type) ───
  const absenceDays: Record<AbsenceKind, number> = { ...ZERO_ABSENCES };
  for (const a of absences) {
    absenceDays[a.kind] = (absenceDays[a.kind] || 0) + 1;
  }
  const paidLeaveDays = absenceDays.CONGE;
  const sickOrAccidentDays = absenceDays.MALADIE + absenceDays.ACCIDENT;
  const otherAbsenceDays = absenceDays.PERSONNEL + absenceDays.AUTRE;

  // ─── Retards ───
  const latenessMinutes = lateness.reduce((sum, l) => sum + Math.max(0, l.minutes), 0);

  return {
    totalWorkedHours: round2(totalWorkedHours),
    normalHours: round2(normalHours),
    overtimeHours: round2(overtimeHours),
    complementaryHours: round2(complementaryHours),
    sundayHours: round2(sundayHours),
    holidayHours: round2(holidayHours),
    absenceDays,
    paidLeaveDays,
    sickOrAccidentDays,
    otherAbsenceDays,
    latenessMinutes,
  };
}

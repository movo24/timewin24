/**
 * Adaptateur source Étage 1 → Étage 2 : convertit les faits bruts existants
 * (`ClockIn`, `AbsenceDeclaration`) en faits qualifiés consommés par
 * l'agrégateur. Fonctions **pures** (aucune lecture/écriture DB ici — l'appelant
 * fournit les lignes déjà chargées).
 *
 * FRONTIÈRE : ne produit que des quantités/qualifications, jamais de montant.
 *
 * Conventions documentées :
 *  - heures réelles = intervalle `clockInAt → clockOutAt` (pointages incomplets
 *    exclus). Date/heure dérivées en UTC ; la normalisation fuseau
 *    (Europe/Paris) est une étape amont au chargement.
 *  - un pointage à cheval sur minuit est rattaché à la date de `clockInAt`.
 *  - absences : un fait par jour CALENDAIRE de [startDate, endDate] inclus, pour
 *    les déclarations APPROUVÉES uniquement. Le filtrage jours ouvrés/ouvrables
 *    est une qualification aval (intersection avec le planning).
 */
import type { WorkedFact, LatenessFact, AbsenceDayFact, AbsenceKind } from "./types";

// ─── Formes minimales des lignes sources (sous-ensemble des modèles Prisma) ───

export interface ClockInRow {
  clockInAt: Date;
  clockOutAt: Date | null;
  status?: string | null; // "ON_TIME" | "LATE" | "ABSENT"
  lateMinutes?: number | null;
}

export interface AbsenceRow {
  type: string; // AbsenceType
  startDate: Date;
  endDate: Date;
  status?: string | null; // "PENDING" | "APPROVED" | "REJECTED"
}

// ─── Helpers date UTC ───

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

function hm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const VALID_KINDS: AbsenceKind[] = ["MALADIE", "CONGE", "PERSONNEL", "ACCIDENT", "AUTRE"];

// ─── Pointages → créneaux travaillés ───

/** Créneaux réellement travaillés à partir des pointages complets. */
export function workedFactsFromClockIns(rows: ClockInRow[]): WorkedFact[] {
  const facts: WorkedFact[] = [];
  for (const r of rows) {
    if (!r.clockOutAt) continue; // pointage incomplet → exclu
    facts.push({ date: ymd(r.clockInAt), startTime: hm(r.clockInAt), endTime: hm(r.clockOutAt) });
  }
  return facts;
}

/** Faits de retard à partir des pointages en retard. */
export function latenessFromClockIns(rows: ClockInRow[]): LatenessFact[] {
  const facts: LatenessFact[] = [];
  for (const r of rows) {
    const mins = r.lateMinutes ?? 0;
    if (r.status === "LATE" && mins > 0) {
      facts.push({ date: ymd(r.clockInAt), minutes: mins });
    }
  }
  return facts;
}

// ─── Déclarations d'absence → jours d'absence ───

/**
 * Un fait d'absence par jour calendaire de [startDate, endDate], déclarations
 * APPROUVÉES uniquement. Types inconnus → "AUTRE" (jamais ignoré silencieusement).
 */
export function absenceFactsFromDeclarations(rows: AbsenceRow[]): AbsenceDayFact[] {
  const facts: AbsenceDayFact[] = [];
  for (const r of rows) {
    if (r.status && r.status !== "APPROVED") continue;
    const kind: AbsenceKind = VALID_KINDS.includes(r.type as AbsenceKind)
      ? (r.type as AbsenceKind)
      : "AUTRE";
    const cur = new Date(Date.UTC(r.startDate.getUTCFullYear(), r.startDate.getUTCMonth(), r.startDate.getUTCDate()));
    const end = new Date(Date.UTC(r.endDate.getUTCFullYear(), r.endDate.getUTCMonth(), r.endDate.getUTCDate()));
    // garde-fou : intervalle inversé → aucun jour
    while (cur.getTime() <= end.getTime()) {
      facts.push({ date: ymd(cur), kind });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  return facts;
}

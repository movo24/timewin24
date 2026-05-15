/**
 * Timesheet — fonctions pures de calcul.
 *
 * AUCUNE dépendance Prisma / DB / I/O ici. Tout est testable unitairement
 * sans setup, et réutilisable côté serveur comme client.
 *
 * Politique :
 *   - Entrées invalides → 0 ou null (pas d'exception lancée).
 *   - Le calcul d'heures est *informatif* — il ne remplace pas un logiciel
 *     de paie. Voir doc/timesheet-api.md (à venir) pour les limites légales.
 *   - Les Date sont comparées au niveau timestamp UTC ; le caller doit
 *     normaliser les dates côté query.ts (tz Europe/Paris implicite).
 */

// ─── Constantes ─────────────────────────────────────────────────────────────

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const SHIFT_BREAK_THRESHOLD_MINUTES = 360; // 6h
const SHIFT_BREAK_MINUTES = 30;

// ─── HH:mm parsing ──────────────────────────────────────────────────────────

/**
 * Parse "HH:mm" string → minutes depuis 00:00 (entre 0 et 1440).
 * Retourne NaN sur format ou plage invalide.
 */
export function parseHHMM(time: unknown): number {
  if (typeof time !== "string") return NaN;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return NaN;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 24 || m < 0 || m > 59) return NaN;
  if (h === 24 && m !== 0) return NaN;
  return h * 60 + m;
}

// ─── Durée d'un shift ───────────────────────────────────────────────────────

/**
 * Durée d'un shift en minutes, gère le passage de minuit.
 *   - "09:00" -> "17:30"  = 510
 *   - "22:00" -> "06:00"  = 480 (cross-midnight)
 *   - "09:00" -> "09:00"  = 0
 *   - Format invalide      = 0
 */
export function computeShiftMinutes(
  startTime: string,
  endTime: string,
): number {
  const start = parseHHMM(startTime);
  const end = parseHHMM(endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  if (end === start) return 0;
  if (end > start) return end - start;
  return MINUTES_PER_DAY - start + end;
}

// ─── Pause estimée ──────────────────────────────────────────────────────────

/**
 * Estimation pause pour un shift, en minutes.
 * Règle : si shift > 6h -> 30 min. Sinon 0.
 *
 * ATTENTION : estimation informative. La vraie pause n'est pas trackée
 * dans le modele Shift. Ne pas utiliser pour un bulletin de paie reel.
 */
export function estimateBreakMinutes(shiftMinutes: number): number {
  if (typeof shiftMinutes !== "number" || !isFinite(shiftMinutes)) return 0;
  if (shiftMinutes <= 0) return 0;
  return shiftMinutes > SHIFT_BREAK_THRESHOLD_MINUTES
    ? SHIFT_BREAK_MINUTES
    : 0;
}

// ─── Heures pointées ────────────────────────────────────────────────────────

export type WorkedResult = {
  worked: number;
  inProgress: boolean;
  capped: boolean;
};

/**
 * Calcule les minutes pointées entre clockInAt et clockOutAt.
 *   - clockOutAt null              -> worked=0, inProgress=true
 *   - clockOutAt <= clockInAt      -> worked=0 (anomalie data)
 *   - durée > 24h                  -> cap à 1440 + capped=true
 */
export function computeWorkedMinutes(
  clockInAt: Date,
  clockOutAt: Date | null,
): WorkedResult {
  if (clockOutAt === null) {
    return { worked: 0, inProgress: true, capped: false };
  }
  const diffMs = clockOutAt.getTime() - clockInAt.getTime();
  if (diffMs <= 0) {
    return { worked: 0, inProgress: false, capped: false };
  }
  const minutes = Math.floor(diffMs / MS_PER_MINUTE);
  if (minutes > MINUTES_PER_DAY) {
    return { worked: MINUTES_PER_DAY, inProgress: false, capped: true };
  }
  return { worked: minutes, inProgress: false, capped: false };
}

// ─── Chevauchement de dates ─────────────────────────────────────────────────

/**
 * Nombre de jours d'intersection entre deux périodes inclusives.
 * Utile pour compter les jours d'absence dans une fenêtre timesheet.
 * Renvoie 0 si aucune intersection.
 */
export function daysOverlap(
  rangeStart: Date,
  rangeEnd: Date,
  otherStart: Date,
  otherEnd: Date,
): number {
  const start = Math.max(rangeStart.getTime(), otherStart.getTime());
  const end = Math.min(rangeEnd.getTime(), otherEnd.getTime());
  if (start > end) return 0;
  return Math.floor((end - start) / MS_PER_DAY) + 1;
}

// ─── Semaine ISO 8601 ───────────────────────────────────────────────────────

/**
 * Lundi (00:00 UTC) de la semaine ISO 8601 contenant `date`.
 *   getUTCDay() : 0=Dim, 1=Lun, ..., 6=Sam
 *   Pour tomber sur lundi, on recule de (day + 6) % 7 jours.
 */
export function getISOWeekStart(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const daysFromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysFromMonday);
  return d;
}

/**
 * Dimanche (00:00 UTC) de la même semaine ISO 8601 = lundi + 6 jours.
 */
export function getISOWeekEnd(date: Date): Date {
  const start = getISOWeekStart(date);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

// ─── Heures supplémentaires (informatif) ────────────────────────────────────

/**
 * Minutes au-dessus de la semaine contractuelle.
 *
 * V1 INFORMATIF. Ne tient pas compte des majorations, plafonds annuels,
 * contingents, ou conventions collectives.
 *   - weeklyHoursContractual null -> 0
 */
export function overtimeForWeek(
  workedMinutes: number,
  weeklyHoursContractual: number | null,
): number {
  if (
    weeklyHoursContractual === null ||
    !isFinite(weeklyHoursContractual) ||
    weeklyHoursContractual <= 0
  ) {
    return 0;
  }
  if (!isFinite(workedMinutes) || workedMinutes <= 0) return 0;
  const contractMinutes = weeklyHoursContractual * 60;
  if (workedMinutes <= contractMinutes) return 0;
  return workedMinutes - contractMinutes;
}

// ─── Coût brut estimé ───────────────────────────────────────────────────────

/**
 * Coût brut salarial estimé = (workedMinutes / 60) * hourlyRateGross.
 * Arrondi à 2 décimales.
 *
 *   - hourlyRateGross null  -> null (pas configuré)
 *   - hourlyRateGross < 0   -> null (donnée corrompue)
 *   - workedMinutes <= 0    -> 0
 *
 * V1 BRUT SEULEMENT, hors charges patronales et majorations.
 */
export function estimateGrossCost(
  workedMinutes: number,
  hourlyRateGross: number | null,
): number | null {
  if (
    hourlyRateGross === null ||
    !isFinite(hourlyRateGross) ||
    hourlyRateGross < 0
  ) {
    return null;
  }
  if (!isFinite(workedMinutes) || workedMinutes <= 0) return 0;
  const raw = (workedMinutes / 60) * hourlyRateGross;
  return Math.round(raw * 100) / 100;
}

// ─── Helper UI ──────────────────────────────────────────────────────────────

/**
 * Minutes -> "HHhMM" (ex: 510 -> "8h30", 5 -> "0h05").
 * Pour CSV / affichage UI uniquement.
 */
export function formatMinutesAsHours(minutes: number): string {
  if (!isFinite(minutes) || minutes < 0) return "0h00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

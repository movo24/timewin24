/**
 * Jours fériés français — calcul déterministe et pur.
 *
 * FRONTIÈRE : ce module QUALIFIE des dates (férié / non férié). Il ne valorise
 * rien en euros et n'applique aucune majoration. La valorisation reste au moteur
 * de paie externe.
 *
 * Couvre les 11 jours fériés légaux de France métropolitaine :
 *  - fixes : 1 jan, 1 mai, 8 mai, 14 juil, 15 août, 1 nov, 11 nov, 25 déc
 *  - mobiles (basés sur Pâques) : lundi de Pâques, Ascension, lundi de Pentecôte
 */

/** Formate une date UTC en "YYYY-MM-DD". */
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

/** Décale une date UTC d'un nombre de jours (renvoie une nouvelle Date). */
function addDays(d: Date, days: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

/**
 * Dimanche de Pâques (calendrier grégorien) — algorithme de Meeus/Jones/Butcher.
 * Renvoie une Date UTC à minuit.
 */
export function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Ensemble des jours fériés légaux français pour une année donnée,
 * sous forme de chaînes "YYYY-MM-DD".
 */
export function frenchHolidays(year: number): Set<string> {
  const easter = computeEaster(year);
  const fixed = [
    `${year}-01-01`, // Jour de l'an
    `${year}-05-01`, // Fête du Travail
    `${year}-05-08`, // Victoire 1945
    `${year}-07-14`, // Fête nationale
    `${year}-08-15`, // Assomption
    `${year}-11-01`, // Toussaint
    `${year}-11-11`, // Armistice 1918
    `${year}-12-25`, // Noël
  ];
  const movable = [
    ymd(addDays(easter, 1)), // Lundi de Pâques
    ymd(addDays(easter, 39)), // Ascension
    ymd(addDays(easter, 50)), // Lundi de Pentecôte
  ];
  return new Set([...fixed, ...movable]);
}

/** Vrai si la date "YYYY-MM-DD" est un jour férié légal français. */
export function isFrenchHoliday(date: string): boolean {
  const year = Number(date.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  return frenchHolidays(year).has(date);
}

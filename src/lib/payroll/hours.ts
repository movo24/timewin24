/**
 * Calculs d'heures purs pour la qualification paie.
 *
 * FRONTIÈRE : compte des heures (quantités), jamais de montants. Aucune
 * majoration, aucun taux, aucun euro.
 */

/** Convertit "HH:mm" en minutes depuis minuit. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Durée en heures d'un créneau "HH:mm" → "HH:mm".
 * Si la fin est <= au début, le créneau est considéré comme franchissant minuit
 * (ajout de 24 h). Arrondi à 2 décimales.
 */
export function intervalHours(startTime: string, endTime: string): number {
  let minutes = toMinutes(endTime) - toMinutes(startTime);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

/** Vrai si la date "YYYY-MM-DD" tombe un dimanche. */
export function isSunday(date: string): boolean {
  return new Date(date + "T00:00:00Z").getUTCDay() === 0;
}

/** Numéro de jour de semaine (0 = dimanche … 6 = samedi) pour "YYYY-MM-DD". */
export function dayOfWeek(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

/** Arrondi monétaire-neutre à 2 décimales (quantités d'heures). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

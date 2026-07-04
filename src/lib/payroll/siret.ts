/**
 * Validation SIREN / SIRET (pure) — identifiants d'établissement français.
 *
 * SIREN = 9 chiffres (entreprise), SIRET = 14 chiffres (SIREN + NIC 5 chiffres),
 * tous deux contrôlés par la clé de Luhn. Aucune valorisation : ce sont des
 * identifiants administratifs nécessaires à la DSN (granularité établissement).
 *
 * Exception documentée : le SIRET de La Poste (356000000) ne respecte pas Luhn ;
 * non géré ici (cas hors périmètre TimeWin24).
 */

/** Normalise une saisie en ne gardant que les chiffres. */
export function normalizeDigits(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

/** Clé de Luhn sur une chaîne de chiffres. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48; // '0' = 48
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Vrai si `value` est un SIREN valide (9 chiffres + Luhn). */
export function isValidSiren(value: string): boolean {
  const d = normalizeDigits(value);
  return d.length === 9 && luhnValid(d);
}

/** Vrai si `value` est un SIRET valide (14 chiffres + Luhn). */
export function isValidSiret(value: string): boolean {
  const d = normalizeDigits(value);
  return d.length === 14 && luhnValid(d);
}

/** Extrait le SIREN (9 premiers chiffres) d'un SIRET, ou null si invalide. */
export function sirenFromSiret(siret: string): string | null {
  const d = normalizeDigits(siret);
  return d.length === 14 ? d.slice(0, 9) : null;
}

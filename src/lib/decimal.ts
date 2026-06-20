/**
 * Decimal boundary helpers (M101).
 *
 * Prisma maps `@db.Decimal` columns to `Prisma.Decimal` objects (decimal.js),
 * NOT JS numbers. This module converts them back to `number` at two boundaries:
 *  - compute boundary: feeding the pure-`number` employer-cost engine
 *  - serialization boundary: API responses (Decimal serializes to a JSON *string*,
 *    which would silently change response shapes — we coerce to number to keep
 *    the existing client contract byte-identical)
 *
 * Structural typing on `.toNumber()` avoids coupling to the generated Prisma type.
 */

type DecimalLike = { toNumber(): number };

function isDecimalLike(v: unknown): v is DecimalLike {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as DecimalLike).toNumber === "function"
  );
}

/** Decimal | number -> number */
export function toNum(v: DecimalLike | number): number {
  return isDecimalLike(v) ? v.toNumber() : v;
}

/** Decimal | number | null | undefined -> number | null */
export function toNumN(
  v: DecimalLike | number | null | undefined
): number | null {
  return v == null ? null : toNum(v);
}

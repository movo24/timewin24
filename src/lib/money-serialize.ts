/**
 * Money/rate serialization helpers (M101b).
 *
 * Decimal columns come back from Prisma as `Prisma.Decimal` objects, which
 * `NextResponse.json()` serializes to **strings** — silently changing the API
 * shape and breaking client `.toFixed()` calls. These helpers coerce the
 * Decimal money/rate fields back to `number` so the existing JSON contract
 * (numbers) is preserved and clients need no change.
 */
import { toNumN } from "./decimal";

type Dec = { toNumber(): number };

/** Coerce Product money/rate fields (price, oldPrice, vatRate) to numbers. */
export function serializeProduct<T extends Record<string, unknown>>(p: T): T {
  const o: Record<string, unknown> = { ...p };
  if ("price" in o) o.price = toNumN(o.price as Dec | number | null);
  if ("oldPrice" in o) o.oldPrice = toNumN(o.oldPrice as Dec | number | null);
  if ("vatRate" in o) o.vatRate = toNumN(o.vatRate as Dec | number | null);
  return o as T;
}

/** Coerce a Store's vatRate to number (other fields untouched). */
export function serializeStoreVat<T extends Record<string, unknown>>(s: T): T {
  if (!("vatRate" in s)) return s;
  return { ...s, vatRate: toNumN(s.vatRate as Dec | number | null) } as T;
}

/**
 * Coerce a LabelPrintJob's items: each `priceAtPrint`, and the nested
 * `product` (if included) via serializeProduct.
 */
export function serializeLabelJob<T extends Record<string, unknown>>(job: T): T {
  const items = job.items;
  if (!Array.isArray(items)) return job;
  return {
    ...job,
    items: items.map((it: Record<string, unknown>) => ({
      ...it,
      priceAtPrint: toNumN(it.priceAtPrint as Dec | number | null),
      product:
        it.product && typeof it.product === "object"
          ? serializeProduct(it.product as Record<string, unknown>)
          : it.product,
    })),
  } as T;
}

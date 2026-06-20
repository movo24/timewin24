/**
 * Cost mappers (M101) — bridge Prisma rows (Decimal) to the pure-`number`
 * employer-cost engine, and serialize Decimal money/coefficient fields back to
 * `number` for API responses (preserving the existing JSON number contract).
 */
import { toNum, toNumN } from "./decimal";
import type { CountryRules } from "./employer-cost";

type Dec = { toNumber(): number };

/** A CountryConfig row (or full-include relation) as needed to build engine rules. */
interface CountryConfigRow {
  code: string;
  name: string;
  currency: string;
  minimumWageHour: Dec | number;
  employerRate: Dec | number;
  reductionEnabled: boolean;
  reductionMaxCoeff: Dec | number;
  reductionThreshold: Dec | number;
  extraHourlyCost: Dec | number;
}

/** Build engine CountryRules (all `number`) from a Prisma CountryConfig row. */
export function countryRulesFromConfig(c: CountryConfigRow): CountryRules {
  return {
    code: c.code,
    name: c.name,
    currency: c.currency,
    minimumWageHour: toNum(c.minimumWageHour),
    employerRate: toNum(c.employerRate),
    reductionEnabled: c.reductionEnabled,
    reductionMaxCoeff: toNum(c.reductionMaxCoeff),
    reductionThreshold: toNum(c.reductionThreshold),
    extraHourlyCost: toNum(c.extraHourlyCost),
  };
}

/**
 * Coerce any subset of CountryConfig Decimal fields present on `c` to numbers,
 * preserving all other fields. Safe for partial `select`s (only maps keys present).
 */
export function serializeCountryConfig<T extends Record<string, unknown>>(c: T): T {
  const out: Record<string, unknown> = { ...c };
  for (const k of [
    "minimumWageHour",
    "employerRate",
    "reductionMaxCoeff",
    "reductionThreshold",
    "extraHourlyCost",
  ]) {
    if (k in out && out[k] != null) out[k] = toNum(out[k] as Dec | number);
  }
  return out as T;
}

/** EmployeeCost Decimal fields -> numbers; recurses into `country` if present. */
export function serializeEmployeeCost<T extends Record<string, unknown>>(c: T): T {
  const out: Record<string, unknown> = { ...c };
  out.hourlyRateGross = toNum(out.hourlyRateGross as Dec | number);
  out.fixedMissionCost = toNumN(out.fixedMissionCost as Dec | number | null);
  out.employerRateOverride = toNumN(out.employerRateOverride as Dec | number | null);
  out.extraHourlyCostOverride = toNumN(out.extraHourlyCostOverride as Dec | number | null);
  if (out.country && typeof out.country === "object") {
    out.country = serializeCountryConfig(out.country as Record<string, unknown>);
  }
  return out as T;
}

/**
 * Employer Cost Calculation Engine
 *
 * Calculates total employer cost from gross hourly rate,
 * including employer charges and SMIC-zone reductions (Fillon-style).
 *
 * Math model:
 * - Charges_full = Gross * employerRate
 * - Reduction = Gross * C(Gross, SMIC) [Fillon coefficient, degressive]
 * - EmployerCost = Gross + Charges_full - Reduction + extras
 *
 * The Fillon reduction coefficient formula (official French model):
 *   C = maxCoeff / 0.6 * (threshold * SMIC_period / Gross - 1)
 *   Clamped to [0, maxCoeff]
 *
 * Where:
 *   - maxCoeff = 0.3206 (2026, general case <50 employees)
 *   - threshold = 1.6 (reduction disappears at 1.6x SMIC)
 *   - SMIC_period = SMIC_hourly * hours
 */

export interface CountryRules {
  code: string;
  name: string;
  currency: string;
  minimumWageHour: number;
  employerRate: number;        // ex: 0.45 = 45%
  reductionEnabled: boolean;
  reductionMaxCoeff: number;   // ex: 0.3206
  reductionThreshold: number;  // ex: 1.6
  extraHourlyCost: number;     // fixed cost per hour
}

export interface CostInput {
  hourlyRateGross: number;     // Taux horaire brut (€/h)
  hours: number;               // Heures travaillées
  rules: CountryRules;
  employerRateOverride?: number | null;
  extraHourlyCostOverride?: number | null;
}

export interface CostBreakdown {
  // Input
  hourlyRateGross: number;
  hours: number;

  // Gross
  grossTotal: number;          // hourlyRateGross * hours

  // SMIC split
  smicHourly: number;
  smicTotal: number;           // min(grossTotal, smic * hours)
  aboveSmicTotal: number;      // max(0, grossTotal - smicTotal)

  // Charges
  employerRate: number;        // effective rate used
  chargesFull: number;         // grossTotal * employerRate
  chargesOnSmic: number;       // smicTotal * employerRate
  chargesAboveSmic: number;    // aboveSmicTotal * employerRate

  // Fillon-style reduction
  reductionEnabled: boolean;
  fillonCoefficient: number;   // the C coefficient
  reductionAmount: number;     // grossTotal * C (capped)

  // Net charges after reduction
  chargesNet: number;          // chargesFull - reductionAmount
  chargesSmicNet: number;      // chargesOnSmic - min(reduction, chargesOnSmic)
  chargesAboveSmicNet: number; // chargesAboveSmic (no reduction above)

  // Extra costs
  extraHourlyCost: number;
  extraTotal: number;          // extraHourlyCost * hours

  // Totals
  employerCostTotal: number;   // grossTotal + chargesNet + extraTotal
  costPerHour: number;         // employerCostTotal / hours
  chargeRateEffective: number; // chargesNet / grossTotal (% effectif)
}

/**
 * Calculate the Fillon reduction coefficient.
 *
 * Official formula (simplified for programming):
 *   C = (maxCoeff / 0.6) * ((threshold * SMIC_period / Gross_period) - 1)
 *   Clamped to [0, maxCoeff]
 *
 * When Gross = SMIC → C ≈ maxCoeff (maximum reduction)
 * When Gross = threshold * SMIC → C = 0 (no reduction)
 * When Gross > threshold * SMIC → C = 0
 */
export function calculateFillonCoefficient(
  grossPeriod: number,
  smicPeriod: number,
  maxCoeff: number,
  threshold: number
): number {
  if (grossPeriod <= 0 || smicPeriod <= 0) return 0;

  const ratio = (threshold * smicPeriod) / grossPeriod;
  const C = (maxCoeff / 0.6) * (ratio - 1);

  // Clamp to [0, maxCoeff]
  return Math.max(0, Math.min(C, maxCoeff));
}

/**
 * Main calculation function.
 * Returns a full breakdown of employer costs.
 */
export function calculateEmployerCost(input: CostInput): CostBreakdown {
  const { hourlyRateGross, hours, rules } = input;
  const employerRate = input.employerRateOverride ?? rules.employerRate;
  const extraHourlyCost = input.extraHourlyCostOverride ?? rules.extraHourlyCost;

  // Gross
  const grossTotal = hourlyRateGross * hours;

  // SMIC split
  const smicHourly = rules.minimumWageHour;
  const smicPeriodTotal = smicHourly * hours;
  const smicTotal = Math.min(grossTotal, smicPeriodTotal);
  const aboveSmicTotal = Math.max(0, grossTotal - smicPeriodTotal);

  // Charges "plein pot"
  const chargesFull = grossTotal * employerRate;
  const chargesOnSmic = smicTotal * employerRate;
  const chargesAboveSmic = aboveSmicTotal * employerRate;

  // Fillon reduction
  let fillonCoefficient = 0;
  let reductionAmount = 0;

  if (rules.reductionEnabled && grossTotal > 0) {
    fillonCoefficient = calculateFillonCoefficient(
      grossTotal,
      smicPeriodTotal,
      rules.reductionMaxCoeff,
      rules.reductionThreshold
    );
    reductionAmount = grossTotal * fillonCoefficient;
    // Cap: reduction cannot exceed total charges
    reductionAmount = Math.min(reductionAmount, chargesFull);
  }

  // Net charges
  const chargesNet = chargesFull - reductionAmount;

  // Allocate reduction to SMIC tranche first
  const reductionOnSmic = Math.min(reductionAmount, chargesOnSmic);
  const chargesSmicNet = chargesOnSmic - reductionOnSmic;
  const chargesAboveSmicNet = chargesAboveSmic; // No Fillon above threshold

  // Extra costs
  const extraTotal = extraHourlyCost * hours;

  // Totals
  const employerCostTotal = grossTotal + chargesNet + extraTotal;
  const costPerHour = hours > 0 ? employerCostTotal / hours : 0;
  const chargeRateEffective = grossTotal > 0 ? chargesNet / grossTotal : 0;

  return {
    hourlyRateGross,
    hours,
    grossTotal: round2(grossTotal),
    smicHourly,
    smicTotal: round2(smicTotal),
    aboveSmicTotal: round2(aboveSmicTotal),
    employerRate,
    chargesFull: round2(chargesFull),
    chargesOnSmic: round2(chargesOnSmic),
    chargesAboveSmic: round2(chargesAboveSmic),
    reductionEnabled: rules.reductionEnabled,
    fillonCoefficient: round4(fillonCoefficient),
    reductionAmount: round2(reductionAmount),
    chargesNet: round2(chargesNet),
    chargesSmicNet: round2(chargesSmicNet),
    chargesAboveSmicNet: round2(chargesAboveSmicNet),
    extraHourlyCost,
    extraTotal: round2(extraTotal),
    employerCostTotal: round2(employerCostTotal),
    costPerHour: round2(costPerHour),
    chargeRateEffective: round4(chargeRateEffective),
  };
}

/** Round to 2 decimals */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round to 4 decimals */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ─── France 2026 defaults ────────────────────────

export const FRANCE_2026_DEFAULTS: CountryRules = {
  code: "FR",
  name: "France",
  currency: "EUR",
  minimumWageHour: 12.02,    // SMIC horaire brut 2026
  employerRate: 0.45,         // ~45% charges patronales globales (approx moyen)
  reductionEnabled: true,
  reductionMaxCoeff: 0.3206,  // Coefficient max réduction générale
  reductionThreshold: 1.6,    // Seuil 1.6x SMIC
  extraHourlyCost: 0,
};

/**
 * Quick calculation for a single shift.
 * Used by the timeline to show cost per shift.
 */
export function calculateShiftCost(
  startTime: string,
  endTime: string,
  hourlyRateGross: number,
  rules: CountryRules,
  employerRateOverride?: number | null,
  extraHourlyCostOverride?: number | null
): CostBreakdown {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const hours = (eh * 60 + em - (sh * 60 + sm)) / 60;

  return calculateEmployerCost({
    hourlyRateGross,
    hours: Math.max(0, hours),
    rules,
    employerRateOverride,
    extraHourlyCostOverride,
  });
}

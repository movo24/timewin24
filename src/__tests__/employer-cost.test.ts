import {
  calculateEmployerCost,
  calculateFillonCoefficient,
  FRANCE_2026_DEFAULTS,
} from "@/lib/employer-cost";
import { toNum, toNumN } from "@/lib/decimal";
import { countryRulesFromConfig } from "@/lib/cost-mappers";

// Minimal Prisma.Decimal stand-in: only `.toNumber()` matters for the boundary.
class FakeDecimal {
  constructor(private v: number) {}
  toNumber() {
    return this.v;
  }
}

describe("employer-cost engine (M007 / M101)", () => {
  it("computes full Fillon reduction at SMIC level", () => {
    const b = calculateEmployerCost({
      hourlyRateGross: 12.02, // = SMIC 2026
      hours: 10,
      rules: FRANCE_2026_DEFAULTS,
    });
    expect(b.grossTotal).toBe(120.2);
    expect(b.smicTotal).toBe(120.2);
    expect(b.aboveSmicTotal).toBe(0);
    // At SMIC, coefficient is maxed (0.3206)
    expect(b.fillonCoefficient).toBeCloseTo(0.3206, 4);
    expect(b.reductionAmount).toBeCloseTo(38.54, 2);
    expect(b.chargesNet).toBeCloseTo(15.55, 2);
    expect(b.employerCostTotal).toBeCloseTo(135.75, 2);
  });

  it("applies no Fillon reduction above 1.6x SMIC", () => {
    const b = calculateEmployerCost({
      hourlyRateGross: 25, // well above 1.6 * 12.02 = 19.232
      hours: 10,
      rules: FRANCE_2026_DEFAULTS,
    });
    expect(b.fillonCoefficient).toBe(0);
    expect(b.reductionAmount).toBe(0);
    expect(b.chargesFull).toBeCloseTo(112.5, 2);
    expect(b.employerCostTotal).toBeCloseTo(362.5, 2);
  });

  it("honors per-employee override rates", () => {
    const b = calculateEmployerCost({
      hourlyRateGross: 20,
      hours: 10,
      rules: FRANCE_2026_DEFAULTS,
      employerRateOverride: 0.3,
      extraHourlyCostOverride: 2,
    });
    expect(b.employerRate).toBe(0.3);
    expect(b.extraHourlyCost).toBe(2);
    expect(b.extraTotal).toBe(20); // 2 * 10
  });

  it("Fillon coefficient clamps to [0, maxCoeff]", () => {
    expect(calculateFillonCoefficient(0, 100, 0.3206, 1.6)).toBe(0);
    expect(calculateFillonCoefficient(100, 0, 0.3206, 1.6)).toBe(0);
    // Below SMIC would overshoot -> clamped to maxCoeff
    expect(calculateFillonCoefficient(50, 120, 0.3206, 1.6)).toBe(0.3206);
  });
});

describe("Decimal boundary helpers (M101)", () => {
  it("toNum unwraps Decimal-like and passes through numbers", () => {
    expect(toNum(new FakeDecimal(12.5))).toBe(12.5);
    expect(toNum(7)).toBe(7);
  });

  it("toNumN preserves null/undefined, unwraps otherwise", () => {
    expect(toNumN(null)).toBeNull();
    expect(toNumN(undefined)).toBeNull();
    expect(toNumN(new FakeDecimal(3.14))).toBe(3.14);
    expect(toNumN(9)).toBe(9);
  });

  it("countryRulesFromConfig coerces all Decimal fields to numbers", () => {
    const rules = countryRulesFromConfig({
      code: "FR",
      name: "France",
      currency: "EUR",
      minimumWageHour: new FakeDecimal(12.02),
      employerRate: new FakeDecimal(0.45),
      reductionEnabled: true,
      reductionMaxCoeff: new FakeDecimal(0.3206),
      reductionThreshold: new FakeDecimal(1.6),
      extraHourlyCost: new FakeDecimal(0),
    });
    expect(typeof rules.minimumWageHour).toBe("number");
    expect(typeof rules.employerRate).toBe("number");
    expect(rules.minimumWageHour).toBe(12.02);
    expect(rules.reductionThreshold).toBe(1.6);
    // Feeds the engine without producing NaN
    const b = calculateEmployerCost({ hourlyRateGross: 12.02, hours: 1, rules });
    expect(Number.isNaN(b.employerCostTotal)).toBe(false);
  });
});

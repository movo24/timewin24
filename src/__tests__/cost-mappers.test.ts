import {
  countryRulesFromConfig,
  serializeCountryConfig,
  serializeEmployeeCost,
} from "@/lib/cost-mappers";

// M116 / M101 — passage des lignes Prisma (Decimal) au moteur de coût (number)
// et sérialisation API (Decimal -> number, contrat JSON préservé).

const dec = (n: number) => ({ toNumber: () => n });

describe("countryRulesFromConfig", () => {
  it("convertit les champs Decimal en number et préserve le reste", () => {
    const r = countryRulesFromConfig({
      code: "FR", name: "France", currency: "EUR",
      minimumWageHour: dec(11.88), employerRate: dec(0.42),
      reductionEnabled: true, reductionMaxCoeff: dec(0.3194),
      reductionThreshold: dec(1.6), extraHourlyCost: dec(0),
    });
    expect(r.minimumWageHour).toBe(11.88);
    expect(r.employerRate).toBe(0.42);
    expect(r.reductionMaxCoeff).toBe(0.3194);
    expect(r.extraHourlyCost).toBe(0);
    expect(r.code).toBe("FR");
    expect(r.reductionEnabled).toBe(true);
  });
  it("accepte aussi des number bruts", () => {
    const r = countryRulesFromConfig({
      code: "BE", name: "Belgique", currency: "EUR",
      minimumWageHour: 12, employerRate: 0.25, reductionEnabled: false,
      reductionMaxCoeff: 0, reductionThreshold: 0, extraHourlyCost: 0,
    });
    expect(r.minimumWageHour).toBe(12);
    expect(r.reductionEnabled).toBe(false);
  });
});

describe("serializeCountryConfig", () => {
  it("coerce les champs Decimal présents, préserve les autres", () => {
    const out = serializeCountryConfig({
      code: "FR", minimumWageHour: dec(11.88), employerRate: 0.42, label: "x",
    });
    expect(out.minimumWageHour).toBe(11.88);
    expect(out.employerRate).toBe(0.42);
    expect(out.code).toBe("FR");
    expect(out.label).toBe("x");
  });
  it("ignore les clés absentes (select partiel)", () => {
    const out = serializeCountryConfig({ code: "FR", minimumWageHour: dec(11) });
    expect("reductionMaxCoeff" in out).toBe(false);
    expect("extraHourlyCost" in out).toBe(false);
  });
  it("préserve null sans le convertir", () => {
    const out = serializeCountryConfig({ minimumWageHour: null });
    expect(out.minimumWageHour).toBeNull();
  });
});

describe("serializeEmployeeCost", () => {
  it("coerce les montants et recurse dans country", () => {
    const out = serializeEmployeeCost({
      hourlyRateGross: dec(15),
      fixedMissionCost: null,
      employerRateOverride: dec(0.4),
      extraHourlyCostOverride: undefined,
      country: { code: "FR", minimumWageHour: dec(11.88) },
    });
    expect(out.hourlyRateGross).toBe(15);
    expect(out.fixedMissionCost).toBeNull();
    expect(out.employerRateOverride).toBe(0.4);
    expect(out.extraHourlyCostOverride).toBeNull();
    expect((out.country as Record<string, unknown>).minimumWageHour).toBe(11.88);
    expect((out.country as Record<string, unknown>).code).toBe("FR");
  });
  it("fonctionne sans country", () => {
    const out = serializeEmployeeCost({
      hourlyRateGross: 20, fixedMissionCost: dec(100),
      employerRateOverride: null, extraHourlyCostOverride: dec(2),
    });
    expect(out.hourlyRateGross).toBe(20);
    expect(out.fixedMissionCost).toBe(100);
    expect(out.employerRateOverride).toBeNull();
    expect(out.extraHourlyCostOverride).toBe(2);
  });
});

import { NextRequest } from "next/server";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { calculateEmployerCost, FRANCE_2026_DEFAULTS, type CountryRules } from "@/lib/employer-cost";
import { prisma } from "@/lib/prisma";

// POST /api/costs/simulate - Run cost simulation
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { hourlyRateGross, hours, employerRateOverride, extraHourlyCostOverride } = body;

  if (hourlyRateGross == null || hours == null) {
    return errorResponse("Champs obligatoires: hourlyRateGross, hours", 400);
  }

  // Get country rules
  let rules: CountryRules;

  // Always use France 2026 defaults (single-country mode)
  // If country config exists in DB, use it; otherwise fallback to hardcoded defaults
  const country = await prisma.countryConfig.findUnique({
    where: { code: "FR" },
  });
  if (country) {
    rules = {
      code: country.code,
      name: country.name,
      currency: country.currency,
      minimumWageHour: country.minimumWageHour,
      employerRate: country.employerRate,
      reductionEnabled: country.reductionEnabled,
      reductionMaxCoeff: country.reductionMaxCoeff,
      reductionThreshold: country.reductionThreshold,
      extraHourlyCost: country.extraHourlyCost,
    };
  } else {
    rules = FRANCE_2026_DEFAULTS;
  }

  const breakdown = calculateEmployerCost({
    hourlyRateGross: parseFloat(hourlyRateGross),
    hours: parseFloat(hours),
    rules,
    employerRateOverride: employerRateOverride != null ? parseFloat(employerRateOverride) : null,
    extraHourlyCostOverride: extraHourlyCostOverride != null ? parseFloat(extraHourlyCostOverride) : null,
  });

  return successResponse({ breakdown, rules });
}

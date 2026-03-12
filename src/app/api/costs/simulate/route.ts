import { NextRequest } from "next/server";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { calculateEmployerCost, FRANCE_2026_DEFAULTS, type CountryRules } from "@/lib/employer-cost";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const simulateSchema = z.object({
  hourlyRateGross: z.number().positive(),
  hours: z.number().positive().max(744),
  employerRateOverride: z.number().min(0).max(1).optional(),
  extraHourlyCostOverride: z.number().min(0).optional(),
});

// POST /api/costs/simulate - Run cost simulation
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const parsed = simulateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }
    const { hourlyRateGross, hours, employerRateOverride, extraHourlyCostOverride } = parsed.data;

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
      hourlyRateGross,
      hours,
      rules,
      employerRateOverride: employerRateOverride ?? null,
      extraHourlyCostOverride: extraHourlyCostOverride ?? null,
    });

    return successResponse({ breakdown, rules });
  } catch (err) {
    console.error("POST /api/costs/simulate error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

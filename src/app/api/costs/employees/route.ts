import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { FRANCE_2026_DEFAULTS } from "@/lib/employer-cost";

// GET /api/costs/employees?storeId=xxx - List employee cost configs
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId");

  const where = storeId
    ? { employee: { stores: { some: { storeId } } } }
    : {};

  const configs = await prisma.employeeCost.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, email: true } },
      country: { select: { code: true, name: true, minimumWageHour: true, employerRate: true } },
    },
    orderBy: { employee: { lastName: "asc" } },
  });

  return successResponse({ configs });
}

// POST /api/costs/employees - Create or update employee cost config
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { employeeId, countryCode, hourlyRateGross, fixedMissionCost, employerRateOverride, extraHourlyCostOverride } = body;

  if (!employeeId || !countryCode || hourlyRateGross == null) {
    return errorResponse("Champs obligatoires: employeeId, countryCode, hourlyRateGross", 400);
  }

  // Verify employee exists
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return errorResponse("Employé non trouvé", 404);

  // Verify country exists — auto-create France if missing
  let country = await prisma.countryConfig.findUnique({ where: { code: countryCode.toUpperCase() } });
  if (!country && countryCode.toUpperCase() === "FR") {
    country = await prisma.countryConfig.create({
      data: {
        code: "FR",
        name: "France",
        currency: "EUR",
        minimumWageHour: FRANCE_2026_DEFAULTS.minimumWageHour,
        employerRate: FRANCE_2026_DEFAULTS.employerRate,
        reductionEnabled: FRANCE_2026_DEFAULTS.reductionEnabled,
        reductionMaxCoeff: FRANCE_2026_DEFAULTS.reductionMaxCoeff,
        reductionThreshold: FRANCE_2026_DEFAULTS.reductionThreshold,
        extraHourlyCost: FRANCE_2026_DEFAULTS.extraHourlyCost,
        notes: "France 2026 - auto-configuré",
      },
    });
  }
  if (!country) return errorResponse(`Pays "${countryCode}" non configuré`, 404);

  // Upsert
  const config = await prisma.employeeCost.upsert({
    where: { employeeId },
    create: {
      employeeId,
      countryCode: countryCode.toUpperCase(),
      hourlyRateGross: parseFloat(hourlyRateGross),
      fixedMissionCost: fixedMissionCost != null ? parseFloat(fixedMissionCost) : null,
      employerRateOverride: employerRateOverride != null ? parseFloat(employerRateOverride) : null,
      extraHourlyCostOverride: extraHourlyCostOverride != null ? parseFloat(extraHourlyCostOverride) : null,
    },
    update: {
      countryCode: countryCode.toUpperCase(),
      hourlyRateGross: parseFloat(hourlyRateGross),
      fixedMissionCost: fixedMissionCost != null ? parseFloat(fixedMissionCost) : null,
      employerRateOverride: employerRateOverride != null ? parseFloat(employerRateOverride) : null,
      extraHourlyCostOverride: extraHourlyCostOverride != null ? parseFloat(extraHourlyCostOverride) : null,
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      country: { select: { code: true, name: true } },
    },
  });

  return successResponse({ config }, 201);
}

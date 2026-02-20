import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";

// GET /api/costs/countries/[code]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { code } = await params;
  const country = await prisma.countryConfig.findUnique({
    where: { code: code.toUpperCase() },
  });

  if (!country) return errorResponse("Pays non trouvé", 404);
  return successResponse({ country });
}

// PUT /api/costs/countries/[code]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { code } = await params;
  const body = await req.json();

  const existing = await prisma.countryConfig.findUnique({
    where: { code: code.toUpperCase() },
  });
  if (!existing) return errorResponse("Pays non trouvé", 404);

  const country = await prisma.countryConfig.update({
    where: { code: code.toUpperCase() },
    data: {
      name: body.name ?? existing.name,
      currency: body.currency ?? existing.currency,
      minimumWageHour: body.minimumWageHour != null ? parseFloat(body.minimumWageHour) : existing.minimumWageHour,
      employerRate: body.employerRate != null ? parseFloat(body.employerRate) : existing.employerRate,
      reductionEnabled: body.reductionEnabled ?? existing.reductionEnabled,
      reductionMaxCoeff: body.reductionMaxCoeff != null ? parseFloat(body.reductionMaxCoeff) : existing.reductionMaxCoeff,
      reductionThreshold: body.reductionThreshold != null ? parseFloat(body.reductionThreshold) : existing.reductionThreshold,
      extraHourlyCost: body.extraHourlyCost != null ? parseFloat(body.extraHourlyCost) : existing.extraHourlyCost,
      notes: body.notes !== undefined ? body.notes : existing.notes,
    },
  });

  return successResponse({ country });
}

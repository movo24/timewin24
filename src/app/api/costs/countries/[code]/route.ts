import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { z } from "zod";

const countryUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currency: z.string().max(10).optional(),
  minimumWageHour: z.number().min(0).optional(),
  employerRate: z.number().min(0).max(1).optional(),
  reductionEnabled: z.boolean().optional(),
  reductionMaxCoeff: z.number().min(0).optional(),
  reductionThreshold: z.number().min(0).optional(),
  extraHourlyCost: z.number().min(0).optional(),
  notes: z.string().nullable().optional(),
}).partial();

// GET /api/costs/countries/[code]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { code } = await params;
    const country = await prisma.countryConfig.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!country) return errorResponse("Pays non trouvé", 404);
    return successResponse({ country });
  } catch (err) {
    console.error("GET /api/costs/countries/[code] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// PUT /api/costs/countries/[code]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { code } = await params;
    const body = await req.json();

    const parsed = countryUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const existing = await prisma.countryConfig.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!existing) return errorResponse("Pays non trouvé", 404);

    const data = parsed.data;
    const country = await prisma.countryConfig.update({
      where: { code: code.toUpperCase() },
      data: {
        name: data.name ?? existing.name,
        currency: data.currency ?? existing.currency,
        minimumWageHour: data.minimumWageHour ?? existing.minimumWageHour,
        employerRate: data.employerRate ?? existing.employerRate,
        reductionEnabled: data.reductionEnabled ?? existing.reductionEnabled,
        reductionMaxCoeff: data.reductionMaxCoeff ?? existing.reductionMaxCoeff,
        reductionThreshold: data.reductionThreshold ?? existing.reductionThreshold,
        extraHourlyCost: data.extraHourlyCost ?? existing.extraHourlyCost,
        notes: data.notes !== undefined ? data.notes : existing.notes,
      },
    });

    return successResponse({ country });
  } catch (err) {
    console.error("PUT /api/costs/countries/[code] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

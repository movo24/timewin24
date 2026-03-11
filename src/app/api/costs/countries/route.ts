import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireManagerOrAdmin, errorResponse, successResponse } from "@/lib/api-helpers";

// GET /api/costs/countries - List all country configs
export async function GET() {
  const { error } = await requireManagerOrAdmin();
  if (error) return error;

  const countries = await prisma.countryConfig.findMany({
    orderBy: { name: "asc" },
  });

  return successResponse({ countries });
}

// POST /api/costs/countries - Create a new country config
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const {
    code, name, currency, minimumWageHour, employerRate,
    reductionEnabled, reductionMaxCoeff, reductionThreshold,
    extraHourlyCost, notes,
  } = body;

  if (!code || !name || minimumWageHour == null || employerRate == null) {
    return errorResponse("Champs obligatoires: code, name, minimumWageHour, employerRate", 400);
  }

  // Check unique code
  const existing = await prisma.countryConfig.findUnique({ where: { code } });
  if (existing) {
    return errorResponse(`Le code pays "${code}" existe déjà`, 409);
  }

  const country = await prisma.countryConfig.create({
    data: {
      code: code.toUpperCase(),
      name,
      currency: currency || "EUR",
      minimumWageHour: parseFloat(minimumWageHour),
      employerRate: parseFloat(employerRate),
      reductionEnabled: reductionEnabled ?? true,
      reductionMaxCoeff: parseFloat(reductionMaxCoeff ?? 0.3206),
      reductionThreshold: parseFloat(reductionThreshold ?? 1.6),
      extraHourlyCost: parseFloat(extraHourlyCost ?? 0),
      notes: notes || null,
    },
  });

  return successResponse({ country }, 201);
}

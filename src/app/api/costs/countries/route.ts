import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireManagerOrAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { z } from "zod";

const countrySchema = z.object({
  code: z.string().min(2).max(5),
  name: z.string().min(1).max(100),
  currency: z.string().min(1).max(10).default("EUR"),
  minimumWageHour: z.number().positive(),
  employerRate: z.number().min(0).max(1),
  reductionEnabled: z.boolean().default(false),
  reductionMaxCoeff: z.number().min(0).default(0),
  reductionThreshold: z.number().min(0).default(0),
  extraHourlyCost: z.number().min(0).default(0),
  notes: z.string().optional().nullable(),
});

// GET /api/costs/countries - List all country configs
export async function GET() {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const countries = await prisma.countryConfig.findMany({
      orderBy: { name: "asc" },
    });

    return successResponse({ countries });
  } catch (err) {
    console.error("GET /api/costs/countries error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// POST /api/costs/countries - Create a new country config
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const parsed = countrySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "), 400);
    }

    const { code, name, currency, minimumWageHour, employerRate, reductionEnabled, reductionMaxCoeff, reductionThreshold, extraHourlyCost, notes } = parsed.data;

    // Check unique code
    const existing = await prisma.countryConfig.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) {
      return errorResponse(`Le code pays "${code}" existe déjà`, 409);
    }

    const country = await prisma.countryConfig.create({
      data: {
        code: code.toUpperCase(),
        name,
        currency,
        minimumWageHour,
        employerRate,
        reductionEnabled,
        reductionMaxCoeff,
        reductionThreshold,
        extraHourlyCost,
        notes: notes || null,
      },
    });

    return successResponse({ country }, 201);
  } catch (err) {
    console.error("POST /api/costs/countries error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

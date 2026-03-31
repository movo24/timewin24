import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createUnitSchema = z.object({
  name: z.string().min(1, "Nom requis").max(200),
  type: z.string().max(50).optional().default("region"),
  status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]).optional().default("ACTIVE"),
  organizationId: z.string().min(1, "Organisation requise"),
  country: z.string().max(5).optional().default("FR"),
  currency: z.string().max(5).optional().default("EUR"),
  notes: z.string().optional().nullable(),
});

// GET /api/units
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("organizationId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (orgId) where.organizationId = orgId;

  const units = await prisma.unit.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true } },
      stores: { select: { id: true, name: true, status: true, city: true } },
      _count: { select: { stores: true } },
    },
    orderBy: { name: "asc" },
  });

  return successResponse({ units });
}

// POST /api/units
export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = createUnitSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  // Verify org exists
  const org = await prisma.organization.findUnique({
    where: { id: parsed.data.organizationId },
  });
  if (!org) return errorResponse("Organisation introuvable", 404);

  const unit = await prisma.unit.create({ data: parsed.data });

  await logAudit(session!.user.id, "CREATE", "Unit", unit.id, {
    name: unit.name,
    organizationId: unit.organizationId,
  });

  return successResponse(unit, 201);
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).optional().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]).optional(),
  siret: z.string().max(20).optional().nullable(),
  siren: z.string().max(20).optional().nullable(),
  vatNumber: z.string().max(30).optional().nullable(),
  country: z.string().max(5).optional(),
  currency: z.string().max(5).optional(),
  notes: z.string().optional().nullable(),
});

// GET /api/organizations/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      units: {
        include: {
          stores: { select: { id: true, name: true, status: true, city: true } },
          _count: { select: { stores: true } },
        },
      },
      _count: { select: { units: true } },
    },
  });

  if (!org) return errorResponse("Organisation introuvable", 404);
  return successResponse({ organization: org });
}

// PUT /api/organizations/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateOrgSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) return errorResponse("Organisation introuvable", 404);

  const updated = await prisma.organization.update({
    where: { id },
    data: parsed.data,
  });

  await logAudit(session!.user.id, "UPDATE", "Organization", id, parsed.data);
  return successResponse(updated);
}

// DELETE /api/organizations/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.organization.findUnique({
    where: { id },
    include: { _count: { select: { units: true } } },
  });

  if (!existing) return errorResponse("Organisation introuvable", 404);
  if (existing._count.units > 0) {
    return errorResponse(
      `Impossible de supprimer : ${existing._count.units} unité(s) liée(s). Supprimez d'abord les unités.`
    );
  }

  await prisma.organization.delete({ where: { id } });
  await logAudit(session!.user.id, "DELETE", "Organization", id, { name: existing.name });
  return successResponse({ message: "Organisation supprimée" });
}

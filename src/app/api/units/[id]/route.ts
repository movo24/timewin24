import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateUnitSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.string().max(50).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]).optional(),
  organizationId: z.string().optional(),
  country: z.string().max(5).optional(),
  currency: z.string().max(5).optional(),
  notes: z.string().optional().nullable(),
});

// GET /api/units/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const unit = await prisma.unit.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      stores: {
        include: {
          _count: { select: { employees: true, shifts: true } },
        },
      },
      _count: { select: { stores: true } },
    },
  });

  if (!unit) return errorResponse("Unité introuvable", 404);
  return successResponse({ unit });
}

// PUT /api/units/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateUnitSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const existing = await prisma.unit.findUnique({ where: { id } });
  if (!existing) return errorResponse("Unité introuvable", 404);

  const updated = await prisma.unit.update({
    where: { id },
    data: parsed.data,
  });

  await logAudit(session!.user.id, "UPDATE", "Unit", id, parsed.data);
  return successResponse(updated);
}

// DELETE /api/units/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.unit.findUnique({
    where: { id },
    include: { _count: { select: { stores: true } } },
  });

  if (!existing) return errorResponse("Unité introuvable", 404);
  if (existing._count.stores > 0) {
    return errorResponse(
      `Impossible de supprimer : ${existing._count.stores} magasin(s) lié(s). Réassignez-les d'abord.`
    );
  }

  await prisma.unit.delete({ where: { id } });
  await logAudit(session!.user.id, "DELETE", "Unit", id, { name: existing.name });
  return successResponse({ message: "Unité supprimée" });
}

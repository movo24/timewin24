import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).optional(),
  name: z.string().min(1).optional(),
});

// PUT /api/accounts/[id] — Update account role or name
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!user) return errorResponse("Compte introuvable", 404);

  // Prevent changing own role
  if (parsed.data.role && user.id === session!.user.id) {
    return errorResponse("Impossible de modifier votre propre rôle", 400);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(parsed.data.role && { role: parsed.data.role as "ADMIN" | "MANAGER" | "EMPLOYEE" }),
      ...(parsed.data.name && { name: parsed.data.name }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
    },
  });

  await logAudit(session!.user.id, "UPDATE", "UserAccount", id, parsed.data);

  return successResponse(updated);
}

// DELETE /api/accounts/[id] — Delete a user account (keeps employee)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!user) return errorResponse("Compte introuvable", 404);

  // Prevent deleting own account
  if (user.id === session!.user.id) {
    return errorResponse("Impossible de supprimer votre propre compte", 400);
  }

  await prisma.user.delete({ where: { id } });

  await logAudit(session!.user.id, "DELETE", "UserAccount", id, {});

  return successResponse({ message: "Compte supprimé" });
}

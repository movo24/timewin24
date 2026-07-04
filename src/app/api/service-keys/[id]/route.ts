import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// DELETE /api/service-keys/[id] — révoquer une clé API
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.serviceApiKey.findUnique({ where: { id } });
  if (!existing) return errorResponse("Clé introuvable", 404);

  await prisma.serviceApiKey.delete({ where: { id } });
  // Audit : révocation d'une clé API service (angle sécurité).
  await logAudit(session!.user.id, "DELETE", "ServiceApiKey", id, { name: existing.name, service: existing.service });
  return successResponse({ message: "Clé révoquée" });
}

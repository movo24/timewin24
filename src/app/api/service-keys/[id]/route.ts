import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";

// DELETE /api/service-keys/[id] — révoquer une clé API
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.serviceApiKey.findUnique({ where: { id } });
  if (!existing) return errorResponse("Clé introuvable", 404);

  await prisma.serviceApiKey.delete({ where: { id } });
  return successResponse({ message: "Clé révoquée" });
}

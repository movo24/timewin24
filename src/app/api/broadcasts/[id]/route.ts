import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  requireManagerOrAdmin,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";

// GET /api/broadcasts/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuthenticated();
  if (error) return error;

  const { id } = await params;

  const broadcast = await prisma.broadcast.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      stores: {
        include: { store: { select: { id: true, name: true } } },
      },
    },
  });

  if (!broadcast) return errorResponse("Annonce introuvable", 404);

  return successResponse(broadcast);
}

// DELETE /api/broadcasts/[id] — Admin/Manager only
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireManagerOrAdmin();
  if (error) return error;

  const { id } = await params;

  const broadcast = await prisma.broadcast.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!broadcast) return errorResponse("Annonce introuvable", 404);

  await prisma.broadcast.delete({ where: { id } });

  return successResponse({ message: "Annonce supprimée" });
}

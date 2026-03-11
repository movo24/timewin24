import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

/**
 * DELETE /api/journal/daily/[id] — Delete a manual journal entry
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireManagerOrAdmin();
  if (error) return error;

  const { id } = await params;

  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  if (!entry) return errorResponse("Entrée non trouvée", 404);

  await prisma.journalEntry.delete({ where: { id } });

  return successResponse({ deleted: true });
}

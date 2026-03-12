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
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;

    const entry = await prisma.journalEntry.findUnique({ where: { id } });
    if (!entry) return errorResponse("Entrée non trouvée", 404);

    // Scope check: verify manager has access to this store's journal
    const user = session!.user as { id: string; role: string; employeeId: string | null };
    if (user.role === "MANAGER" && user.employeeId) {
      const managerStores = await prisma.storeEmployee.findMany({
        where: { employeeId: user.employeeId },
        select: { storeId: true },
      });
      const storeIds = managerStores.map((s) => s.storeId);
      if (!storeIds.includes(entry.storeId)) {
        return errorResponse("Accès non autorisé à ce magasin", 403);
      }
    }

    await prisma.journalEntry.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/journal/daily/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

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
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const { id } = await params;
    const user = session!.user as { id: string; role: string; employeeId: string | null };

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

    // If user is an employee, verify they have access to at least one of the broadcast's stores
    if (user.role === "EMPLOYEE" && user.employeeId) {
      const broadcastStoreIds = broadcast.stores.map((s) => s.store.id);
      // If broadcast is scoped to specific stores, check employee belongs to one
      if (broadcastStoreIds.length > 0) {
        const employeeStoreCount = await prisma.storeEmployee.count({
          where: {
            employeeId: user.employeeId,
            storeId: { in: broadcastStoreIds },
          },
        });
        if (employeeStoreCount === 0) {
          return errorResponse("Accès refusé", 403);
        }
      }
    }

    return successResponse(broadcast);
  } catch (err) {
    console.error("GET /api/broadcasts/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// DELETE /api/broadcasts/[id] — Admin/Manager only
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
  } catch (err) {
    console.error("DELETE /api/broadcasts/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

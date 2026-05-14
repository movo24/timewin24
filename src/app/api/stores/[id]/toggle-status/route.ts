import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/stores/[id]/toggle-status
 * Toggle store status between ACTIVE and INACTIVE.
 * Safety checks before deactivation:
 *   - Warns about assigned employees
 *   - Warns about active POS links
 * Admin only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;
    const user = session!.user as { id: string; role: string; companyId: string | null };

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const confirm = body.confirm === true;

    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            employees: true,
            shifts: true,
          },
        },
      },
    });

    if (!store) return errorResponse("Magasin non trouvé", 404);

    // SaaS multi-tenant: cross-company toggle forbidden
    if (
      user.role !== "SUPER_ADMIN" &&
      user.companyId &&
      store.companyId &&
      store.companyId !== user.companyId
    ) {
      return errorResponse("Accès refusé : magasin hors de votre Company", 403);
    }

    const newStatus = store.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    // Safety checks before deactivation (not needed for reactivation)
    if (newStatus === "INACTIVE" && !confirm) {
      const warnings: string[] = [];

      if (store._count.employees > 0) {
        warnings.push(
          `${store._count.employees} employé(s) assigné(s) à ce magasin`
        );
      }

      // Check for active POS links
      const posLinks = await prisma.posStoreLink.count({
        where: { storeId: id },
      });
      if (posLinks > 0) {
        warnings.push(
          `${posLinks} lien(s) POS actif(s) sur ce magasin`
        );
      }

      // Check for future shifts
      const futureShifts = await prisma.shift.count({
        where: {
          storeId: id,
          date: { gte: new Date() },
        },
      });
      if (futureShifts > 0) {
        warnings.push(
          `${futureShifts} shift(s) planifié(s) dans le futur`
        );
      }

      if (warnings.length > 0) {
        return successResponse({
          requireConfirmation: true,
          warnings,
          message: `Attention avant de désactiver "${store.name}"`,
        });
      }
    }

    // Proceed with status change — cascade cleanup when deactivating
    let cancelledShifts = 0;

    if (newStatus === "INACTIVE") {
      // Delete all future shifts for this store — they are no longer valid
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const deleted = await prisma.shift.deleteMany({
        where: { storeId: id, date: { gte: today } },
      });
      cancelledShifts = deleted.count;
    }

    const updated = await prisma.store.update({
      where: { id },
      data: { status: newStatus },
    });

    await logAudit(session!.user.id, "UPDATE", "Store", id, {
      action: newStatus === "ACTIVE" ? "reactivate" : "deactivate",
      before: { status: store.status },
      after: { status: newStatus },
      cancelledShifts,
    });

    return successResponse({
      store: updated,
      cancelledShifts,
      message:
        newStatus === "ACTIVE"
          ? `Le magasin "${store.name}" a été réactivé`
          : `Le magasin "${store.name}" a été désactivé${cancelledShifts > 0 ? ` — ${cancelledShifts} shift(s) futur(s) annulé(s)` : ""}`,
    });
  } catch (err) {
    console.error("POST /api/stores/[id]/toggle-status error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

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

    // Proceed with status change — cascade cleanup when deactivating.
    // M112 — désactivation atomique : suppression des shifts futurs + changement de
    // statut dans une seule $transaction (sinon échec entre les deux = shifts supprimés
    // mais magasin encore ACTIVE).
    let cancelledShifts = 0;
    let updated;

    if (newStatus === "INACTIVE") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [deleted, store2] = await prisma.$transaction([
        prisma.shift.deleteMany({ where: { storeId: id, date: { gte: today } } }),
        prisma.store.update({ where: { id }, data: { status: newStatus } }),
      ]);
      cancelledShifts = deleted.count;
      updated = store2;
    } else {
      updated = await prisma.store.update({
        where: { id },
        data: { status: newStatus },
      });
    }

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

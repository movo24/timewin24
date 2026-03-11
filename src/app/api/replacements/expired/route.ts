import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";

// POST /api/replacements/expired — Check and expire overdue offers
// Called by manager page load or cron job
export async function POST() {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const now = new Date();

    // Find OPEN offers past their expiration
    const expiredOffers = await prisma.replacementOffer.findMany({
      where: {
        status: "OPEN",
        expiresAt: { lt: now },
      },
    });

    if (expiredOffers.length === 0) {
      return successResponse({ expired: 0 });
    }

    const offerIds = expiredOffers.map((o) => o.id);

    // Expire offers and their pending candidates
    await prisma.$transaction([
      prisma.replacementOffer.updateMany({
        where: { id: { in: offerIds } },
        data: { status: "EXPIRED" },
      }),
      prisma.replacementCandidate.updateMany({
        where: {
          offerId: { in: offerIds },
          status: "PENDING",
        },
        data: { status: "EXPIRED" },
      }),
    ]);

    console.log(
      `[POST /api/replacements/expired] Expired ${expiredOffers.length} offers`
    );

    return successResponse({ expired: expiredOffers.length });
  } catch (err) {
    console.error("[POST /api/replacements/expired] Error:", err);
    return errorResponse(
      "Erreur serveur: " + (err instanceof Error ? err.message : "inconnue"),
      500
    );
  }
}

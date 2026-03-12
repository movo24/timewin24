import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";

// POST /api/market-listings/expired — Expire stale OPEN listings
// Called on page load (same pattern as /api/replacements/expired)
export async function POST() {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const now = new Date();

    const result = await prisma.shiftMarketListing.updateMany({
      where: {
        status: "OPEN",
        expiresAt: { lt: now },
      },
      data: { status: "EXPIRED" },
    });

    if (result.count > 0) {
      console.log(`[POST /api/market-listings/expired] Expired ${result.count} listings`);
    }

    return successResponse({ expired: result.count });
  } catch (err) {
    console.error("[POST /api/market-listings/expired] Error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

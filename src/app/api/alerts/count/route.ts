import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/alerts/count
 * Returns the count of UNREAD alerts (lightweight endpoint for sidebar polling).
 */
export async function GET() {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const count = await prisma.managerAlert.count({
      where: { status: "UNREAD" },
    });

    return successResponse({ count });
  } catch (err) {
    console.error("GET /api/alerts/count error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

/**
 * GET /api/alerts?type=&status=&storeId=&date=
 * List alerts with optional filters.
 */
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const storeId = searchParams.get("storeId");
    const dateStr = searchParams.get("date");

    const where: Record<string, unknown> = {};
    if (type && type !== "ALL") where.type = type;
    if (status && status !== "ALL") where.status = status;
    if (storeId && storeId !== "all") where.storeId = storeId;
    if (dateStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return errorResponse("Format de date invalide (YYYY-MM-DD attendu)");
      }
      where.date = new Date(dateStr + "T00:00:00Z");
    }

    const alerts = await prisma.managerAlert.findMany({
      where,
      include: {
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return successResponse({ alerts });
  } catch (err) {
    console.error("GET /api/alerts error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

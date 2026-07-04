import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { resolveStoreWhere } from "@/lib/store-scope";

/**
 * GET /api/analytics/alerts?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&storeId=
 *
 * Alertes manager sur une PLAGE de dates (onglet Alertes de la page Performance).
 * Périmètre magasin appliqué (un manager ne voit que ses magasins).
 * Restaure l'endpoint appelé par `components/analytics/alerts-tab.tsx` (M3).
 */
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { storeIds, error: scopeErr } = await getAccessibleStoreIds();
    if (scopeErr) return scopeErr;

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const storeId = searchParams.get("storeId");

    const scoped = resolveStoreWhere(storeIds, storeId);
    if (!scoped.ok) return errorResponse("Magasin hors de votre périmètre", 403);

    const where: Record<string, unknown> = {};
    if (scoped.where !== undefined) where.storeId = scoped.where;

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) {
        if (!dateRe.test(dateFrom)) return errorResponse("dateFrom invalide (YYYY-MM-DD)");
        range.gte = new Date(dateFrom + "T00:00:00Z");
      }
      if (dateTo) {
        if (!dateRe.test(dateTo)) return errorResponse("dateTo invalide (YYYY-MM-DD)");
        range.lte = new Date(dateTo + "T00:00:00Z");
      }
      where.date = range;
    }

    const alerts = await prisma.managerAlert.findMany({
      where,
      include: { store: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return successResponse({ alerts });
  } catch (err) {
    logger.error("GET /api/analytics/alerts error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

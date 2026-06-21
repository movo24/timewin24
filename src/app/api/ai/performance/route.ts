import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  requireAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import {
  calculateAllMetrics,
  persistMetrics,
} from "@/lib/ai-engine/performance/metrics-calculator";
import { isAiAvailable } from "@/lib/ai-engine/config";

// GET /api/ai/performance — Liste métriques IA employés
export async function GET(req: NextRequest) {
  try {
    const { error } = await requirePermission("view_ai_metrics");
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    // RBAC: Manager voit uniquement ses magasins
    const { storeIds } = await getAccessibleStoreIds();

    // Filtrer les employés visibles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employeeFilter: any = {};
    if (storeIds) {
      const filteredStoreIds = storeId
        ? storeIds.includes(storeId) ? [storeId] : []
        : storeIds;

      if (filteredStoreIds.length === 0) {
        return successResponse({ metrics: [] });
      }

      employeeFilter.stores = {
        some: { storeId: { in: filteredStoreIds } },
      };
    } else if (storeId) {
      employeeFilter.stores = { some: { storeId } };
    }

    const metrics = await prisma.employeeAiMetrics.findMany({
      where: {
        employee: {
          ...employeeFilter,
          active: true,
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            reliabilityScore: true,
            profileCategory: true,
          },
        },
      },
      orderBy: { performanceScore: "desc" },
    });

    return successResponse({ metrics });
  } catch (err) {
    logger.error("[GET /api/ai/performance] Error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// POST /api/ai/performance — Recalculer métriques (Admin only)
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    if (!isAiAvailable()) {
      return errorResponse("Module IA non disponible", 503);
    }

    const body = await req.json().catch(() => ({}));
    const daysBack = (body as { daysBack?: number }).daysBack || 30;

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);

    logger.debug(
      `[POST /api/ai/performance] Calculating metrics for ${daysBack} days...`
    );

    const metrics = await calculateAllMetrics({ start, end });
    const persisted = await persistMetrics(metrics, { start, end });

    return successResponse({
      message: `${persisted} métriques calculées et sauvegardées`,
      count: persisted,
      period: { start: start.toISOString(), end: end.toISOString() },
    });
  } catch (err) {
    logger.error("[POST /api/ai/performance] Error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

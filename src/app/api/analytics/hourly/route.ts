import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

// GET /api/analytics/hourly
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { storeIds, error: storeError } = await getAccessibleStoreIds();
    if (storeError) return storeError;

    const { searchParams } = new URL(req.url);
    const dateFromStr = searchParams.get("dateFrom");
    const dateToStr = searchParams.get("dateTo");
    const storeIdParam = searchParams.get("storeId");

    if (!dateFromStr || !dateToStr) {
      return errorResponse("dateFrom et dateTo sont requis");
    }

    const dateFrom = new Date(dateFromStr);
    const dateTo = new Date(dateToStr);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return errorResponse("Format de date invalide");
    }

    // Build store filter
    const storeFilter: Record<string, unknown> = {};
    if (storeIdParam) {
      if (storeIds && !storeIds.includes(storeIdParam)) {
        return errorResponse("Accès refusé à ce magasin", 403);
      }
      storeFilter.storeId = storeIdParam;
    } else if (storeIds) {
      storeFilter.storeId = { in: storeIds };
    }

    // Récupérer les ventes POS groupées par hourSlot + jour de la semaine
    const salesData = await prisma.posSalesData.findMany({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      select: {
        date: true,
        hourSlot: true,
        revenue: true,
        transactions: true,
      },
    });

    // Agréger par hour + dayOfWeek
    const heatmapIndex = new Map<
      string,
      { revenue: number; transactions: number }
    >();

    for (const sale of salesData) {
      const dayOfWeek = (sale.date as Date).getDay(); // 0=dimanche, 1=lundi, ...
      const key = `${sale.hourSlot}:${dayOfWeek}`;

      if (!heatmapIndex.has(key)) {
        heatmapIndex.set(key, { revenue: 0, transactions: 0 });
      }
      const entry = heatmapIndex.get(key)!;
      entry.revenue += sale.revenue;
      entry.transactions += sale.transactions;
    }

    const heatmap = Array.from(heatmapIndex.entries())
      .map(([key, data]) => {
        const [hour, dayOfWeek] = key.split(":").map(Number);
        return {
          hour,
          dayOfWeek,
          revenue: Math.round(data.revenue * 100) / 100,
          transactions: data.transactions,
        };
      })
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour);

    return successResponse({ heatmap });
  } catch (err) {
    console.error("[analytics/hourly] Error:", err);
    return errorResponse("Erreur interne du serveur", 500);
  }
}

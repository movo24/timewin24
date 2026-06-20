import { NextRequest } from "next/server";
import { requireManagerOrAdmin, errorResponse, successResponse, getAccessibleStoreIds } from "@/lib/api-helpers";
import { collectPosData } from "@/lib/ai-engine/pos-analysis/data-collector";
import { analyzePosData } from "@/lib/ai-engine/pos-analysis/analyzer";

// POST /api/ai/pos-analysis
// Génère une analyse business IA à partir des données POS réelles
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const body = await req.json();
    const { storeId, dateFrom, dateTo, question } = body as {
      storeId: string;
      dateFrom?: string;
      dateTo?: string;
      question?: string;
    };

    if (!storeId) return errorResponse("storeId requis");

    // Verify store access
    const { storeIds } = await getAccessibleStoreIds();
    if (storeIds && !storeIds.includes(storeId)) {
      return errorResponse("Accès refusé à ce magasin", 403);
    }

    // Default: today
    const today = new Date().toISOString().split("T")[0];
    const from = dateFrom || today;
    const to = dateTo || today;

    // 1. Collect real POS data
    const data = await collectPosData(storeId, from, to);

    // 2. Check if we have data
    if (data.revenue.total === 0 && data.revenue.transactions === 0) {
      return successResponse({
        analysis: `⚠️ Aucune donnée de vente trouvée pour **${data.store.name}** du ${from} au ${to}.\n\nVérifiez que la synchronisation POS est active et que des ventes ont été enregistrées.`,
        data: {
          store: data.store,
          period: data.period,
          revenue: data.revenue,
        },
        tokensUsed: 0,
        generatedAt: new Date().toISOString(),
      });
    }

    // 3. Generate AI analysis
    const result = await analyzePosData(data, question);

    return successResponse({
      analysis: result.analysis,
      data: {
        store: data.store,
        period: data.period,
        revenue: data.revenue,
        costs: data.costs,
        staffing: data.staffing,
        trends: data.trends,
      },
      tokensUsed: result.tokensUsed,
      generatedAt: result.generatedAt,
    });
  } catch (err) {
    console.error("POST /api/ai/pos-analysis error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

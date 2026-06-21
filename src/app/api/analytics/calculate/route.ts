import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import {
  requireAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { aggregatePerformanceData, calculatePerformanceScores } from "@/lib/analytics/performance-aggregator";
import { detectAlerts } from "@/lib/analytics/alerts-detector";

// POST /api/analytics/calculate
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    let body: { dateFrom?: string; dateTo?: string; storeId?: string };
    try {
      body = await req.json();
    } catch {
      return errorResponse("Corps de requête JSON invalide");
    }

    const { dateFrom: dateFromStr, dateTo: dateToStr, storeId } = body;

    if (!dateFromStr || !dateToStr) {
      return errorResponse("dateFrom et dateTo sont requis");
    }

    const dateFrom = new Date(dateFromStr);
    const dateTo = new Date(dateToStr);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return errorResponse("Format de date invalide");
    }

    if (dateFrom > dateTo) {
      return errorResponse("dateFrom doit être antérieur à dateTo");
    }

    const startTime = Date.now();

    // 1. Agréger les données de performance
    const aggregated = await aggregatePerformanceData(dateFrom, dateTo, storeId);

    // 2. Calculer les scores
    const scored = await calculatePerformanceScores(dateFrom, dateTo, storeId);

    // 3. Détecter les alertes
    const alerts = await detectAlerts(dateFrom, dateTo, storeId);

    const durationMs = Date.now() - startTime;

    logger.debug(
      `[analytics/calculate] Agrégé: ${aggregated}, Scoré: ${scored}, Alertes: ${alerts.length}, Durée: ${durationMs}ms (par ${(session!.user as { email: string }).email})`
    );

    return successResponse({
      aggregated,
      scored,
      alerts,
      durationMs,
    });
  } catch (err) {
    logger.error("[analytics/calculate] Error:", err);
    return errorResponse("Erreur interne du serveur", 500);
  }
}

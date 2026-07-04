import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import {
  requirePermission,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { detectAnomalies } from "@/lib/ai-engine/anomaly/detector";
import { generateAlerts } from "@/lib/ai-engine/anomaly/alert-generator";
import { isFeatureEnabled } from "@/lib/ai-engine/config";

// POST /api/ai/anomaly/scan — Lancer scan anomalies
export async function POST(req: NextRequest) {
  try {
    const { error } = await requirePermission("manage_ai_anomalies");
    if (error) return error;

    if (!isFeatureEnabled("anomalyDetection")) {
      return errorResponse("Détection d'anomalies désactivée", 503);
    }

    const body = await req.json().catch(() => ({}));
    const { storeId, daysBack: rawDaysBack } = body as {
      storeId?: string;
      daysBack?: number;
    };

    // FIX M5: Cap daysBack to prevent excessive queries
    const MAX_DAYS_BACK = 90;
    const daysBack = Math.min(rawDaysBack || 30, MAX_DAYS_BACK);

    logger.debug(
      `[POST /api/ai/anomaly/scan] Starting scan (${daysBack} days, store: ${storeId || "all"})...`
    );

    // 1. Detecter les anomalies
    const anomalies = await detectAnomalies({
      storeId,
      daysBack,
    });

    // 2. Générer les alertes et fraud scores
    const result = await generateAlerts(anomalies);

    return successResponse({
      message: `Scan terminé: ${anomalies.length} anomalies détectées`,
      anomaliesDetected: anomalies.length,
      anomaliesSaved: result.anomaliesSaved,
      alertsCreated: result.alertsCreated,
      fraudScores: result.fraudScores.slice(0, 10), // Top 10
    });
  } catch (err) {
    logger.error("[POST /api/ai/anomaly/scan] Error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

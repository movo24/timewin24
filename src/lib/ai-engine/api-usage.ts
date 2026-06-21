/**
 * AI Engine — API Usage Tracking
 *
 * Enregistre automatiquement tous les appels API Gemini
 * dans la table AiApiUsage pour le suivi des coûts.
 */

import { logger } from "@/lib/logger";
import { onApiUsage } from "./shared/gemini-client";
import type { ApiUsageEntry } from "./types";

let _initialized = false;

/**
 * Initialise le tracking automatique de l'usage API.
 * Appelé une seule fois au démarrage.
 */
export function initApiUsageTracking(): void {
  if (_initialized) return;
  _initialized = true;

  onApiUsage(async (entry: ApiUsageEntry) => {
    try {
      // Import dynamique pour éviter les problèmes de circular deps
      const { prisma } = await import("@/lib/prisma");

      await prisma.aiApiUsage.create({
        data: {
          model: entry.model,
          operation: entry.operation,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          totalTokens: entry.totalTokens,
          durationMs: entry.durationMs,
          success: entry.success,
          error: entry.error || null,
        },
      });
    } catch (err) {
      // Ne jamais casser le flow principal pour du tracking
      logger.warn("[AI Engine] Usage tracking failed:", (err as Error).message);
    }
  });

  logger.debug("[AI Engine] API usage tracking initialized");
}

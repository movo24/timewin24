import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { AI_CONFIG, isAiAvailable } from "@/lib/ai-engine/config";
import { getEmbeddingStats } from "@/lib/ai-engine/shared/vector-store";

// GET /api/ai/status — Statut moteur IA
export async function GET(_req: NextRequest) {
  try {
    const { error } = await requirePermission("view_ai_metrics");
    if (error) return error;

    // Stats de base
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalAnomalies,
      totalConversations,
      tokensToday,
      tokensThisMonth,
      embeddingStats,
    ] = await Promise.all([
      prisma.aiAnomaly.count(),
      prisma.aiConversation.count(),
      prisma.aiApiUsage.aggregate({
        where: { createdAt: { gte: today } },
        _sum: { totalTokens: true },
      }),
      prisma.aiApiUsage.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { totalTokens: true },
      }),
      getEmbeddingStats().catch(() => []),
    ]);

    const totalEmbeddings = embeddingStats.reduce(
      (sum, s) => sum + s.count,
      0
    );

    return successResponse({
      enabled: AI_CONFIG.enabled,
      apiKeyConfigured: !!AI_CONFIG.gemini.apiKey,
      available: isAiAvailable(),
      features: {
        enhancedNlp: AI_CONFIG.features.enhancedNlp,
        performanceAnalysis: AI_CONFIG.features.performanceAnalysis,
        anomalyDetection: AI_CONFIG.features.anomalyDetection,
        assistant: AI_CONFIG.features.assistant,
      },
      models: {
        generation: AI_CONFIG.gemini.generationModel,
        embedding: AI_CONFIG.gemini.embeddingModel,
      },
      stats: {
        totalEmbeddings,
        embeddingsByType: embeddingStats,
        totalAnomalies,
        totalConversations,
        tokensUsedToday: tokensToday._sum.totalTokens || 0,
        tokensUsedThisMonth: tokensThisMonth._sum.totalTokens || 0,
      },
    });
  } catch (err) {
    console.error("[GET /api/ai/status] Error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

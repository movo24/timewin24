/**
 * AI Engine — Comprehensive Test Route
 *
 * GET /api/ai/test — Tests all AI Engine components end-to-end
 * Returns structured results for each module.
 *
 * Admin only. Used for verification and demo purposes.
 */

import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { AI_CONFIG, isAiAvailable } from "@/lib/ai-engine/config";

// ─── Types ───────────────────────────────────────

interface TestResult {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  durationMs: number;
  details: Record<string, unknown>;
  error?: string;
}

// ─── GET /api/ai/test ────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const results: TestResult[] = [];
    const startAll = Date.now();

    logger.debug("\n╔══════════════════════════════════════════╗");
    logger.debug("║  AI ENGINE — COMPREHENSIVE TEST SUITE    ║");
    logger.debug("╚══════════════════════════════════════════╝\n");

    // ─── Test 1: Configuration ─────────────────
    results.push(await testConfiguration());

    // ─── Test 2: Gemini Connection ─────────────
    results.push(await testGeminiConnection());

    // ─── Test 3: Embedding Generation ──────────
    results.push(await testEmbeddingGeneration());

    // ─── Test 4: NLP Pipeline ──────────────────
    const nlpResults = await testNlpPipeline();
    results.push(...nlpResults);

    // ─── Test 5: Performance Module ────────────
    results.push(await testPerformanceModule());

    // ─── Test 6: Anomaly Detection ─────────────
    results.push(await testAnomalyDetection());

    // ─── Test 7: Vector Store ──────────────────
    results.push(await testVectorStore());

    // ─── Test 8: RAG Pipeline ──────────────────
    results.push(await testRagPipeline());

    // ─── Test 9: API Usage Tracking ────────────
    results.push(await testApiUsageTracking());

    // ─── Summary ───────────────────────────────
    const passed = results.filter((r) => r.status === "PASS").length;
    const failed = results.filter((r) => r.status === "FAIL").length;
    const skipped = results.filter((r) => r.status === "SKIP").length;
    const totalDuration = Date.now() - startAll;

    logger.debug("\n╔══════════════════════════════════════════╗");
    logger.debug(`║  RESULTS: ${passed} PASS / ${failed} FAIL / ${skipped} SKIP`);
    logger.debug(`║  Total duration: ${totalDuration}ms`);
    logger.debug("╚══════════════════════════════════════════╝\n");

    return successResponse({
      summary: {
        total: results.length,
        passed,
        failed,
        skipped,
        durationMs: totalDuration,
        timestamp: new Date().toISOString(),
      },
      config: {
        enabled: AI_CONFIG.enabled,
        apiKeyConfigured: !!AI_CONFIG.gemini.apiKey,
        available: isAiAvailable(),
        features: AI_CONFIG.features,
        models: {
          generation: AI_CONFIG.gemini.generationModel,
          embedding: AI_CONFIG.gemini.embeddingModel,
        },
      },
      results,
    });
  } catch (err) {
    logger.error("[AI Test] Fatal error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// ─── Test Functions ──────────────────────────────

async function testConfiguration(): Promise<TestResult> {
  const start = Date.now();
  const name = "1. Configuration & Feature Flags";

  try {
    const details: Record<string, unknown> = {
      AI_ENGINE_ENABLED: AI_CONFIG.enabled,
      GEMINI_API_KEY: AI_CONFIG.gemini.apiKey ? `${AI_CONFIG.gemini.apiKey.substring(0, 8)}...` : "NOT SET",
      generationModel: AI_CONFIG.gemini.generationModel,
      embeddingModel: AI_CONFIG.gemini.embeddingModel,
      features: AI_CONFIG.features,
      isAiAvailable: isAiAvailable(),
      nlpThreshold: AI_CONFIG.nlp.confidenceThreshold,
      zScoreThreshold: AI_CONFIG.anomaly.zScoreThreshold,
      rateLimitPerMin: AI_CONFIG.rateLimit.maxRequestsPerMinute,
    };

    const status = AI_CONFIG.gemini.apiKey ? "PASS" : "FAIL";
    logger.debug(`[Test] ${name}: ${status} — API Key: ${status === "PASS" ? "configured" : "MISSING"}`);

    return { name, status, durationMs: Date.now() - start, details, ...(status === "FAIL" ? { error: "GEMINI_API_KEY not set in .env" } : {}) };
  } catch (err) {
    return { name, status: "FAIL", durationMs: Date.now() - start, details: {}, error: (err as Error).message };
  }
}

async function testGeminiConnection(): Promise<TestResult> {
  const start = Date.now();
  const name = "2. Gemini API Connection";

  if (!isAiAvailable()) {
    logger.debug(`[Test] ${name}: SKIP — API not available`);
    return { name, status: "SKIP", durationMs: Date.now() - start, details: { reason: "GEMINI_API_KEY not configured" } };
  }

  try {
    const { generateText } = await import("@/lib/ai-engine/shared/gemini-client");

    const { text, tokensUsed } = await generateText(
      "Reponds uniquement par: CONNEXION_OK",
      { temperature: 0, maxOutputTokens: 32 }
    );

    const isOk = text.includes("CONNEXION_OK");
    logger.debug(`[Test] ${name}: ${isOk ? "PASS" : "FAIL"} — Response: "${text.trim()}", tokens: ${tokensUsed}`);

    return {
      name,
      status: isOk ? "PASS" : "FAIL",
      durationMs: Date.now() - start,
      details: { response: text.trim(), tokensUsed, model: AI_CONFIG.gemini.generationModel },
    };
  } catch (err) {
    logger.error(`[Test] ${name}: FAIL —`, (err as Error).message);
    return { name, status: "FAIL", durationMs: Date.now() - start, details: {}, error: (err as Error).message };
  }
}

async function testEmbeddingGeneration(): Promise<TestResult> {
  const start = Date.now();
  const name = "3. Embedding Generation";

  if (!isAiAvailable()) {
    logger.debug(`[Test] ${name}: SKIP — API not available`);
    return { name, status: "SKIP", durationMs: Date.now() - start, details: { reason: "GEMINI_API_KEY not configured" } };
  }

  try {
    const { generateEmbedding, generateEmbeddingBatch } = await import("@/lib/ai-engine/shared/gemini-client");

    // Single embedding
    const single = await generateEmbedding("Yassin travaille au Chatelet le mardi matin");
    const singleOk = single.vector.length === 768;

    // Batch embeddings
    const batch = await generateEmbeddingBatch([
      "Employe fiable, toujours ponctuel",
      "Magasin Chatelet, Paris centre",
      "Alerte: retards frequents cette semaine",
    ]);
    const batchOk = batch.vectors.length === 3 && batch.vectors.every((v) => v.length === 768);

    // Test cosine similarity between related texts
    const dot = single.vector.reduce((sum, a, i) => sum + a * batch.vectors[0][i], 0);
    const norm1 = Math.sqrt(single.vector.reduce((sum, a) => sum + a * a, 0));
    const norm2 = Math.sqrt(batch.vectors[0].reduce((sum, a) => sum + a * a, 0));
    const similarity = dot / (norm1 * norm2);

    const pass = singleOk && batchOk;
    logger.debug(`[Test] ${name}: ${pass ? "PASS" : "FAIL"} — dim=${single.vector.length}, batch=${batch.vectors.length}, similarity=${similarity.toFixed(3)}`);

    return {
      name,
      status: pass ? "PASS" : "FAIL",
      durationMs: Date.now() - start,
      details: {
        singleEmbedding: { dimension: single.vector.length, tokensUsed: single.tokensUsed, first5: single.vector.slice(0, 5) },
        batchEmbedding: { count: batch.vectors.length, tokensUsed: batch.tokensUsed },
        cosineSimilarity: Math.round(similarity * 1000) / 1000,
        model: AI_CONFIG.gemini.embeddingModel,
      },
    };
  } catch (err) {
    logger.error(`[Test] ${name}: FAIL —`, (err as Error).message);
    return { name, status: "FAIL", durationMs: Date.now() - start, details: {}, error: (err as Error).message };
  }
}

async function testNlpPipeline(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const commands = [
    { input: "Cree un shift pour Yassin demain 9h-17h", expected: { action: "CREATE", hasEmployee: true, hasDate: true } },
    { input: "Qui travaille samedi prochain ?", expected: { action: "QUERY_SCHEDULE", hasDate: true } },
    { input: "Deplace Zakaria de mardi a jeudi", expected: { action: "MOVE", hasEmployee: true } },
    { input: "Mets le petit au chatelet demain matin", expected: { needsGemini: true } },
    { input: "Optimise la semaine prochaine", expected: { action: "OPTIMIZE_WEEK" } },
  ];

  const parseContext = {
    knownEmployees: [
      { firstName: "Yassin", lastName: "El Amri" },
      { firstName: "Zakaria", lastName: "Benali" },
      { firstName: "Sarah", lastName: "Martin" },
    ],
    knownStores: ["Chatelet", "Opera", "Republique"],
  };

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const start = Date.now();
    const name = `4.${i + 1} NLP: "${cmd.input.substring(0, 40)}..."`;

    try {
      const { enhancedParse } = await import("@/lib/ai-engine/nlp/enhanced-pipeline");

      const result = await enhancedParse(cmd.input, parseContext, {
        fallbackToGemini: isAiAvailable(),
        today: new Date().toISOString().split("T")[0],
      });

      const details: Record<string, unknown> = {
        input: cmd.input,
        action: result.action,
        source: result.source,
        confidence: result.confidence,
        employeeName: result.employeeName,
        dateExpr: result.dateExpr,
        startTimeExpr: result.startTimeExpr,
        endTimeExpr: result.endTimeExpr,
      };

      // Basic validation
      let pass = true;
      if (cmd.expected.action && result.action !== cmd.expected.action) {
        // For ambiguous commands, accept any valid action
        if (!cmd.expected.needsGemini) pass = false;
      }

      logger.debug(`[Test] ${name}: ${pass ? "PASS" : "FAIL"} — action=${result.action}, source=${result.source}, confidence=${result.confidence?.toFixed(2)}`);
      results.push({ name, status: pass ? "PASS" : "FAIL", durationMs: Date.now() - start, details });
    } catch (err) {
      logger.error(`[Test] ${name}: FAIL —`, (err as Error).message);
      results.push({ name, status: "FAIL", durationMs: Date.now() - start, details: { input: cmd.input }, error: (err as Error).message });
    }
  }

  return results;
}

async function testPerformanceModule(): Promise<TestResult> {
  const start = Date.now();
  const name = "5. Performance Module";

  try {
    const { prisma } = await import("@/lib/prisma");

    // Check if we have data to work with
    const employeeCount = await prisma.employee.count({ where: { active: true } });
    const shiftCount = await prisma.shift.count();
    const salesCount = await prisma.posSalesData.count();
    const timeClockCount = await prisma.posTimeClock.count();

    const details: Record<string, unknown> = {
      activeEmployees: employeeCount,
      totalShifts: shiftCount,
      salesRecords: salesCount,
      timeClockRecords: timeClockCount,
    };

    if (employeeCount === 0) {
      logger.debug(`[Test] ${name}: SKIP — No employees in DB`);
      return { name, status: "SKIP", durationMs: Date.now() - start, details: { ...details, reason: "No employees in database" } };
    }

    // Test POS correlator
    const { correlateEmployeeSales } = await import("@/lib/ai-engine/performance/pos-correlator");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const correlations = await correlateEmployeeSales(thirtyDaysAgo, new Date());

    details.correlations = {
      count: correlations.length,
      sample: correlations.slice(0, 3).map((c) => ({
        employeeId: c.employeeId.substring(0, 8) + "...",
        revenuePerHour: c.revenuePerHour,
        totalHours: c.totalHours,
        shiftCount: c.shiftCount,
      })),
    };

    // Test metrics calculator
    const { calculateAllMetrics } = await import("@/lib/ai-engine/performance/metrics-calculator");
    const metrics = await calculateAllMetrics({ start: thirtyDaysAgo, end: new Date() });

    details.metrics = {
      count: metrics.length,
      sample: metrics.slice(0, 3).map((m) => ({
        employeeId: m.employeeId.substring(0, 8) + "...",
        performanceScore: m.performanceScore,
        upsellScore: m.upsellScore,
        riskScore: m.riskScore,
        regularityScore: m.regularityScore,
        fraudRiskScore: m.fraudRiskScore,
      })),
    };

    logger.debug(`[Test] ${name}: PASS — ${correlations.length} correlations, ${metrics.length} metrics calculated`);
    return { name, status: "PASS", durationMs: Date.now() - start, details };
  } catch (err) {
    logger.error(`[Test] ${name}: FAIL —`, (err as Error).message);
    return { name, status: "FAIL", durationMs: Date.now() - start, details: {}, error: (err as Error).message };
  }
}

async function testAnomalyDetection(): Promise<TestResult> {
  const start = Date.now();
  const name = "6. Anomaly Detection";

  try {
    const { detectAnomalies } = await import("@/lib/ai-engine/anomaly/detector");
    const { calculateFraudScores } = await import("@/lib/ai-engine/anomaly/fraud-scorer");

    // Run detection on last 30 days
    const anomalies = await detectAnomalies({ daysBack: 30 });

    // Group by type
    const byType: Record<string, number> = {};
    for (const a of anomalies) {
      byType[a.type] = (byType[a.type] || 0) + 1;
    }

    // Calculate fraud scores
    const fraudScores = calculateFraudScores(anomalies);

    const details: Record<string, unknown> = {
      totalAnomalies: anomalies.length,
      byType,
      bySeverity: {
        CRITICAL: anomalies.filter((a) => a.severity === "CRITICAL").length,
        HIGH: anomalies.filter((a) => a.severity === "HIGH").length,
        MEDIUM: anomalies.filter((a) => a.severity === "MEDIUM").length,
        LOW: anomalies.filter((a) => a.severity === "LOW").length,
      },
      fraudScores: fraudScores.slice(0, 5).map((fs) => ({
        employeeId: fs.employeeId.substring(0, 8) + "...",
        score: fs.fraudRiskScore,
        anomalies: fs.totalAnomalies,
      })),
      sampleAnomalies: anomalies.slice(0, 3).map((a) => ({
        type: a.type,
        severity: a.severity,
        description: a.description.substring(0, 80),
        date: a.date.toISOString().split("T")[0],
      })),
    };

    logger.debug(`[Test] ${name}: PASS — ${anomalies.length} anomalies detected, ${fraudScores.length} fraud scores`);
    return { name, status: "PASS", durationMs: Date.now() - start, details };
  } catch (err) {
    logger.error(`[Test] ${name}: FAIL —`, (err as Error).message);
    return { name, status: "FAIL", durationMs: Date.now() - start, details: {}, error: (err as Error).message };
  }
}

async function testVectorStore(): Promise<TestResult> {
  const start = Date.now();
  const name = "7. Vector Store (pgvector)";

  try {
    const { prisma } = await import("@/lib/prisma");

    // Check if pgvector extension exists
    const extensions = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;

    const hasVectorExt = extensions.length > 0;

    if (!hasVectorExt) {
      logger.debug(`[Test] ${name}: SKIP — pgvector extension not installed`);
      return {
        name,
        status: "SKIP",
        durationMs: Date.now() - start,
        details: {
          reason: "pgvector extension not installed. Run scripts/setup-pgvector.sql on production Neon DB",
          extensions: extensions,
        },
      };
    }

    // Check embedding stats
    const { getEmbeddingStats } = await import("@/lib/ai-engine/shared/vector-store");
    const stats = await getEmbeddingStats();

    const details: Record<string, unknown> = {
      pgvectorInstalled: true,
      embeddingStats: stats,
      totalEmbeddings: stats.reduce((sum, s) => sum + s.count, 0),
    };

    // If we have API key, try a test upsert + search
    if (isAiAvailable()) {
      const { generateEmbedding } = await import("@/lib/ai-engine/shared/gemini-client");
      const { upsertEmbedding, searchSimilar, deleteEmbedding } = await import("@/lib/ai-engine/shared/vector-store");

      // Generate a test embedding
      const { vector } = await generateEmbedding("Test embedding pour verification AI Engine");

      // Upsert it
      await upsertEmbedding({
        entityType: "journal",
        entityId: "test-ai-engine-verification",
        content: "Test embedding pour verification AI Engine",
        vector,
      });

      // Search for it
      const searchResults = await searchSimilar(vector, { limit: 5, minSimilarity: 0.5 });

      // Clean up
      await deleteEmbedding("journal", "test-ai-engine-verification");

      details.testUpsert = "OK";
      details.testSearch = {
        resultsFound: searchResults.length,
        topSimilarity: searchResults[0]?.similarity,
      };
      details.testDelete = "OK";
    }

    logger.debug(`[Test] ${name}: PASS — pgvector OK, ${stats.reduce((s, e) => s + e.count, 0)} embeddings`);
    return { name, status: "PASS", durationMs: Date.now() - start, details };
  } catch (err) {
    logger.error(`[Test] ${name}: FAIL —`, (err as Error).message);
    return { name, status: "FAIL", durationMs: Date.now() - start, details: {}, error: (err as Error).message };
  }
}

async function testRagPipeline(): Promise<TestResult> {
  const start = Date.now();
  const name = "8. RAG Pipeline (Assistant)";

  if (!isAiAvailable()) {
    logger.debug(`[Test] ${name}: SKIP — API not available`);
    return { name, status: "SKIP", durationMs: Date.now() - start, details: { reason: "GEMINI_API_KEY not configured" } };
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    // Check pgvector first
    const extensions = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    if (extensions.length === 0) {
      logger.debug(`[Test] ${name}: SKIP — pgvector not available`);
      return { name, status: "SKIP", durationMs: Date.now() - start, details: { reason: "pgvector not available for RAG" } };
    }

    const { askAssistant } = await import("@/lib/ai-engine/assistant/rag");

    // Get a store for context
    const store = await prisma.store.findFirst({ select: { id: true, name: true } });
    if (!store) {
      return { name, status: "SKIP", durationMs: Date.now() - start, details: { reason: "No stores in DB" } };
    }

    const question = "Donne-moi un bref resume de la situation du magasin. Reponds en 2 phrases maximum.";
    const response = await askAssistant(question, {
      storeId: store.id,
      userId: "test-user",
      role: "ADMIN",
    });

    const details: Record<string, unknown> = {
      question: "Resume situation magasin",
      storeName: store.name,
      response: response.message.substring(0, 200),
      sourcesCount: response.sources?.length ?? 0,
      conversationId: response.conversationId,
    };

    const pass = response.message.length > 10;
    logger.debug(`[Test] ${name}: ${pass ? "PASS" : "FAIL"} — ${response.message.length} chars, ${response.sources?.length ?? 0} sources`);
    return { name, status: pass ? "PASS" : "FAIL", durationMs: Date.now() - start, details };
  } catch (err) {
    logger.error(`[Test] ${name}: FAIL —`, (err as Error).message);
    return { name, status: "FAIL", durationMs: Date.now() - start, details: {}, error: (err as Error).message };
  }
}

async function testApiUsageTracking(): Promise<TestResult> {
  const start = Date.now();
  const name = "9. API Usage Tracking";

  try {
    const { prisma } = await import("@/lib/prisma");

    // Check if we have any usage records
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalRecords, todayRecords, todayTokens] = await Promise.all([
      prisma.aiApiUsage.count(),
      prisma.aiApiUsage.count({ where: { createdAt: { gte: today } } }),
      prisma.aiApiUsage.aggregate({
        where: { createdAt: { gte: today } },
        _sum: { totalTokens: true },
      }),
    ]);

    const details: Record<string, unknown> = {
      totalUsageRecords: totalRecords,
      todayRecords,
      todayTokensUsed: todayTokens._sum.totalTokens || 0,
    };

    // Get recent records
    const recent = await prisma.aiApiUsage.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        model: true,
        operation: true,
        totalTokens: true,
        durationMs: true,
        success: true,
        createdAt: true,
      },
    });

    details.recentCalls = recent;

    logger.debug(`[Test] ${name}: PASS — ${totalRecords} total records, ${todayTokens._sum.totalTokens || 0} tokens today`);
    return { name, status: "PASS", durationMs: Date.now() - start, details };
  } catch (err) {
    logger.error(`[Test] ${name}: FAIL —`, (err as Error).message);
    return { name, status: "FAIL", durationMs: Date.now() - start, details: {}, error: (err as Error).message };
  }
}

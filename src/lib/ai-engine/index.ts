/**
 * AI Engine — Exports publics
 *
 * Point d'entrée unique pour le module AI Engine.
 * Import: import { ... } from "@/lib/ai-engine"
 */

// Config & types
export { AI_CONFIG, isAiAvailable, isFeatureEnabled } from "./config";
export type {
  EmbeddingEntityType,
  EmbeddingInput,
  EmbeddingResult,
  VectorSearchResult,
  ConfidenceScore,
  EnhancedParseResult,
  EmployeePerformanceMetrics,
  PerformanceBreakdown,
  AnomalyType,
  AnomalySeverity,
  AnomalyStatus,
  DetectedAnomaly,
  AnomalyEvidence,
  AssistantMessage,
  AssistantSource,
  AssistantContext,
  AssistantResponse,
  ApiUsageEntry,
  AiEngineStatus,
} from "./types";

// Shared infrastructure
export { generateText, generateEmbedding, onApiUsage } from "./shared/gemini-client";
export {
  embedText,
  embedTexts,
  clearEmbeddingCache,
  buildEmployeeText,
  buildStoreText,
  buildJournalText,
} from "./shared/embeddings";
export {
  upsertEmbedding,
  upsertEmbeddings,
  searchSimilar,
  deleteEmbedding,
  getEmbeddingStats,
} from "./shared/vector-store";

// NLP
export { enhancedParse } from "./nlp/enhanced-pipeline";
export { scoreConfidence } from "./nlp/confidence";

// Performance
export { correlateEmployeeSales } from "./performance/pos-correlator";
export { calculateAllMetrics, persistMetrics } from "./performance/metrics-calculator";
export {
  syncEmployeeEmbeddings,
  syncStoreEmbeddings,
  syncJournalEmbeddings,
} from "./performance/embeddings";

// Anomaly
export { detectAnomalies } from "./anomaly/detector";
export { calculateFraudScores } from "./anomaly/fraud-scorer";
export { generateAlerts } from "./anomaly/alert-generator";

// Assistant
export { askAssistant } from "./assistant/rag";

// API Usage tracking initialization
export { initApiUsageTracking } from "./api-usage";

/**
 * AI Engine — Types partagés
 */

// ─── Embeddings ──────────────────────────────────

export type EmbeddingEntityType =
  | "employee"
  | "store"
  | "shift"
  | "journal"
  | "conversation";

export interface EmbeddingInput {
  entityType: EmbeddingEntityType;
  entityId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingResult {
  entityType: EmbeddingEntityType;
  entityId: string;
  vector: number[];
}

export interface VectorSearchResult {
  entityType: EmbeddingEntityType;
  entityId: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
}

// ─── NLP Enhanced ────────────────────────────────

export interface ConfidenceScore {
  overall: number; // 0-1
  actionConfidence: number;
  entityConfidence: number;
  dateConfidence: number;
  timeConfidence: number;
  reasons: string[];
}

export interface EnhancedParseResult {
  source: "deterministic" | "gemini";
  confidence: number;
  // Le ParsedIntent est importé depuis manager-ia/types.ts
}

// ─── Performance Metrics ─────────────────────────

export interface EmployeePerformanceMetrics {
  employeeId: string;
  /** Score global de performance (0-100) */
  performanceScore: number;
  /** Capacité de vente additionnelle (0-100) */
  upsellScore: number;
  /** Risque de départ/problème (0-100) */
  riskScore: number;
  /** Régularité horaire (0-100) */
  regularityScore: number;
  /** Risque de fraude au pointage (0-100) */
  fraudRiskScore: number;
  /** Détail des calculs */
  breakdown: PerformanceBreakdown;
  /** Date du calcul */
  calculatedAt: Date;
}

export interface PerformanceBreakdown {
  /** Chiffre d'affaires moyen par heure travaillée */
  revenuePerHour: number;
  /** Écart vs moyenne du magasin */
  revenueVsAverage: number;
  /** Ratio transactions/heure */
  transactionsPerHour: number;
  /** Taux de ponctualité (%) */
  punctualityRate: number;
  /** Taux de présence (%) */
  attendanceRate: number;
  /** Nombre total d'heures dans la période */
  totalHours: number;
  /** Nombre de shifts dans la période */
  totalShifts: number;
}

// ─── Anomaly Detection ───────────────────────────

export type AnomalyType =
  | "CLOCK_DISCREPANCY" // Écart horloge POS vs TimeWin
  | "REVENUE_DROP" // Chute de CA inexpliquée
  | "GHOST_SHIFT" // Shift sans pointage POS correspondant
  | "PATTERN_BREAK" // Rupture de pattern horaire
  | "OVERTIME_ABUSE" // Heures sup suspectes
  | "LOCATION_MISMATCH"; // Pointage hors zone GPS

export type AnomalySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AnomalyStatus = "DETECTED" | "CONFIRMED" | "REJECTED" | "RESOLVED";

export interface DetectedAnomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  employeeId?: string;
  storeId: string;
  date: Date;
  description: string;
  evidence: AnomalyEvidence;
  suggestedAction?: string;
}

export interface AnomalyEvidence {
  /** Valeur observée */
  observed: number;
  /** Valeur attendue */
  expected: number;
  /** Z-score ou écart relatif */
  deviation: number;
  /** Données brutes ayant déclenché la détection */
  rawData?: Record<string, unknown>;
}

// ─── Assistant RAG ───────────────────────────────

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  sources?: AssistantSource[];
  timestamp: Date;
}

export interface AssistantSource {
  type: EmbeddingEntityType;
  entityId: string;
  label: string;
  similarity: number;
}

export interface AssistantContext {
  storeId?: string;
  userId: string;
  role: string;
  conversationId?: string;
}

export interface AssistantResponse {
  message: string;
  sources: AssistantSource[];
  conversationId: string;
  tokensUsed: number;
}

// ─── API Usage Tracking ──────────────────────────

export interface ApiUsageEntry {
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ─── AI Status ───────────────────────────────────

export interface AiEngineStatus {
  enabled: boolean;
  apiKeyConfigured: boolean;
  features: {
    enhancedNlp: boolean;
    performanceAnalysis: boolean;
    anomalyDetection: boolean;
    assistant: boolean;
  };
  stats: {
    totalEmbeddings: number;
    totalAnomalies: number;
    totalConversations: number;
    tokensUsedToday: number;
    tokensUsedThisMonth: number;
  };
}

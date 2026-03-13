/**
 * AI Engine — Configuration & Feature Flags
 *
 * Toute la configuration du module IA est centralisée ici.
 * Chaque fonction peut être activée/désactivée indépendamment.
 */

// ─── Feature Flags ───────────────────────────────

export const AI_CONFIG = {
  /** Kill switch global — désactive tout le module IA */
  enabled: process.env.AI_ENGINE_ENABLED !== "false",

  /** Fonctions individuelles */
  features: {
    /** NLP amélioré avec fallback Gemini */
    enhancedNlp: process.env.AI_NLP_ENABLED !== "false",
    /** Analyse de performance employés */
    performanceAnalysis: process.env.AI_PERFORMANCE_ENABLED !== "false",
    /** Détection d'anomalies et fraude */
    anomalyDetection: process.env.AI_ANOMALY_ENABLED !== "false",
    /** Assistant manager RAG */
    assistant: process.env.AI_ASSISTANT_ENABLED !== "false",
  },

  /** Configuration Gemini */
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    /** Modèle pour la génération (NLP fallback, assistant) */
    generationModel: "gemini-2.5-flash",
    /** Modèle pour les embeddings */
    embeddingModel: "gemini-embedding-001",
    /** Dimension des embeddings */
    embeddingDimension: 768,
  },

  /** Seuils de confiance NLP */
  nlp: {
    /** En dessous de ce seuil, fallback vers Gemini */
    confidenceThreshold: 0.7,
    /** Nombre max de tokens pour le prompt NLP */
    maxTokens: 1024,
  },

  /** Configuration embeddings */
  embeddings: {
    /** Durée de cache en mémoire (ms) — 24h */
    cacheTtlMs: 24 * 60 * 60 * 1000,
    /** Batch size pour la génération d'embeddings */
    batchSize: 50,
  },

  /** Configuration anomalies */
  anomaly: {
    /** Seuil z-score pour détecter une anomalie */
    zScoreThreshold: 2.5,
    /** Score minimum pour flag de fraude (0-100) */
    fraudAlertThreshold: 70,
  },

  /** Configuration assistant */
  assistant: {
    /** Nombre max de résultats vectoriels */
    maxVectorResults: 10,
    /** Seuil de similarité cosinus (0-1) */
    similarityThreshold: 0.7,
    /** Max tokens pour la réponse */
    maxResponseTokens: 2048,
    /** Nombre max de messages par conversation */
    maxMessagesPerConversation: 50,
  },

  /** Rate limiting */
  rateLimit: {
    /** Max requêtes par minute vers Gemini */
    maxRequestsPerMinute: 30,
    /** Délai entre requêtes si rate limited (ms) */
    retryDelayMs: 2000,
    /** Nombre max de retries */
    maxRetries: 3,
  },
} as const;

// ─── Helpers ─────────────────────────────────────

/** Vérifie si le module IA est disponible (clé API + enabled) */
export function isAiAvailable(): boolean {
  return AI_CONFIG.enabled && !!AI_CONFIG.gemini.apiKey;
}

/** Vérifie si une fonction spécifique est activée */
export function isFeatureEnabled(
  feature: keyof typeof AI_CONFIG.features
): boolean {
  return AI_CONFIG.enabled && AI_CONFIG.features[feature];
}

/** Vérifie la clé API et lève une erreur si manquante */
export function requireApiKey(): string {
  const key = AI_CONFIG.gemini.apiKey;
  if (!key) {
    throw new Error(
      "[AI Engine] GEMINI_API_KEY non configurée. Ajoutez-la dans .env"
    );
  }
  return key;
}

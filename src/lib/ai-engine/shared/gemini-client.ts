/**
 * AI Engine — Client Gemini singleton avec rate limiting
 *
 * Centralise tous les appels à l'API Gemini (génération + embeddings).
 * Implémente un rate limiter simple en mémoire pour éviter les 429.
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  type GenerateContentResult,
  type EmbedContentResponse,
} from "@google/generative-ai";
import { AI_CONFIG, requireApiKey } from "../config";
import type { ApiUsageEntry } from "../types";

// ─── Rate Limiter ────────────────────────────────

class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs = 60_000; // 1 minute
  // FIX H5: Simple mutex to prevent concurrent bypass
  private _pending: Promise<void> = Promise.resolve();

  constructor(maxRequestsPerMinute: number) {
    this.maxRequests = maxRequestsPerMinute;
  }

  async waitIfNeeded(): Promise<void> {
    // Chain calls to prevent concurrent bypass of the rate limit
    this._pending = this._pending.then(() => this._doWait());
    return this._pending;
  }

  private async _doWait(): Promise<void> {
    const now = Date.now();
    // Purge les timestamps anciens
    this.timestamps = this.timestamps.filter(
      (t) => now - t < this.windowMs
    );

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldestInWindow) + 100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    this.timestamps.push(Date.now());
  }
}

// ─── Singleton Client ────────────────────────────

let _genAI: GoogleGenerativeAI | null = null;
let _generativeModel: GenerativeModel | null = null;
const _rateLimiter = new RateLimiter(AI_CONFIG.rateLimit.maxRequestsPerMinute);

/** Callbacks pour traquer l'usage API */
const _usageCallbacks: ((entry: ApiUsageEntry) => void)[] = [];

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    const apiKey = requireApiKey();
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
}

function getGenerativeModel(): GenerativeModel {
  if (!_generativeModel) {
    _generativeModel = getGenAI().getGenerativeModel({
      model: AI_CONFIG.gemini.generationModel,
    });
  }
  return _generativeModel;
}

// ─── Public API ──────────────────────────────────

/**
 * Enregistre un callback pour traquer l'usage API
 */
export function onApiUsage(callback: (entry: ApiUsageEntry) => void): void {
  _usageCallbacks.push(callback);
}

function trackUsage(entry: ApiUsageEntry): void {
  for (const cb of _usageCallbacks) {
    try {
      cb(entry);
    } catch {
      // Ignore tracking errors
    }
  }
}

/**
 * Génère du texte avec Gemini (avec rate limiting + retry)
 */
export async function generateText(
  prompt: string,
  options?: {
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
  }
): Promise<{ text: string; tokensUsed: number }> {
  const startTime = Date.now();
  const model = getGenerativeModel();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= AI_CONFIG.rateLimit.maxRetries; attempt++) {
    try {
      await _rateLimiter.waitIfNeeded();

      const result: GenerateContentResult = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: options?.systemInstruction
          ? { role: "system", parts: [{ text: options.systemInstruction }] }
          : undefined,
        generationConfig: {
          temperature: options?.temperature ?? 0.3,
          maxOutputTokens:
            options?.maxOutputTokens ?? AI_CONFIG.assistant.maxResponseTokens,
        },
      });

      const text = result.response.text();
      const usage = result.response.usageMetadata;
      const tokensUsed =
        (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0);

      trackUsage({
        model: AI_CONFIG.gemini.generationModel,
        operation: "generateText",
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: tokensUsed,
        durationMs: Date.now() - startTime,
        success: true,
      });

      return { text, tokensUsed };
    } catch (err) {
      lastError = err as Error;
      const isRateLimit =
        lastError.message?.includes("429") ||
        lastError.message?.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt < AI_CONFIG.rateLimit.maxRetries) {
        const delay =
          AI_CONFIG.rateLimit.retryDelayMs * Math.pow(2, attempt);
        console.warn(
          `[AI Engine] Rate limited, retry ${attempt + 1}/${AI_CONFIG.rateLimit.maxRetries} in ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      break;
    }
  }

  trackUsage({
    model: AI_CONFIG.gemini.generationModel,
    operation: "generateText",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    durationMs: Date.now() - startTime,
    success: false,
    error: lastError?.message,
  });

  throw lastError || new Error("[AI Engine] Generation failed");
}

/**
 * Génère un embedding pour un texte
 */
export async function generateEmbedding(
  text: string
): Promise<{ vector: number[]; tokensUsed: number }> {
  const startTime = Date.now();
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: AI_CONFIG.gemini.embeddingModel,
  });

  try {
    await _rateLimiter.waitIfNeeded();

    const result: EmbedContentResponse = await model.embedContent(text);
    const vector = result.embedding.values;

    trackUsage({
      model: AI_CONFIG.gemini.embeddingModel,
      operation: "embedContent",
      inputTokens: Math.ceil(text.length / 4), // Approximation
      outputTokens: 0,
      totalTokens: Math.ceil(text.length / 4),
      durationMs: Date.now() - startTime,
      success: true,
    });

    return { vector, tokensUsed: Math.ceil(text.length / 4) };
  } catch (err) {
    trackUsage({
      model: AI_CONFIG.gemini.embeddingModel,
      operation: "embedContent",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      durationMs: Date.now() - startTime,
      success: false,
      error: (err as Error).message,
    });
    throw err;
  }
}

/**
 * Génère des embeddings en batch
 */
export async function generateEmbeddingBatch(
  texts: string[]
): Promise<{ vectors: number[][]; tokensUsed: number }> {
  const startTime = Date.now();
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: AI_CONFIG.gemini.embeddingModel,
  });

  try {
    await _rateLimiter.waitIfNeeded();

    const result = await model.batchEmbedContents({
      requests: texts.map((text) => ({
        content: { role: "user", parts: [{ text }] },
      })),
    });

    const vectors = result.embeddings.map((e) => e.values);
    const approxTokens = texts.reduce(
      (sum, t) => sum + Math.ceil(t.length / 4),
      0
    );

    trackUsage({
      model: AI_CONFIG.gemini.embeddingModel,
      operation: "batchEmbedContents",
      inputTokens: approxTokens,
      outputTokens: 0,
      totalTokens: approxTokens,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return { vectors, tokensUsed: approxTokens };
  } catch (err) {
    trackUsage({
      model: AI_CONFIG.gemini.embeddingModel,
      operation: "batchEmbedContents",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      durationMs: Date.now() - startTime,
      success: false,
      error: (err as Error).message,
    });
    throw err;
  }
}

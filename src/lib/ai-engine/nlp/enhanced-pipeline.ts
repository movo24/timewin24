/**
 * AI Engine — Enhanced NLP Pipeline
 *
 * Orchestrateur: parser déterministe d'abord → score confiance → fallback Gemini si besoin.
 * Le parser existant reste inchangé, ce module l'enveloppe.
 */

import { logger } from "@/lib/logger";
import { parseCommand } from "@/lib/manager-ia/parser";
import type { ParsedIntent } from "@/lib/manager-ia/types";
import { scoreConfidence } from "./confidence";
import { geminiParse } from "./gemini-parser";
import { AI_CONFIG, isFeatureEnabled } from "../config";
import type { ConfidenceScore } from "../types";

// ─── Types ───────────────────────────────────────

interface ParseContext {
  knownEmployees: { firstName: string; lastName: string }[];
  knownStores: string[];
}

interface EnhancedParseOptions {
  /** Activer le fallback Gemini (défaut: true) */
  fallbackToGemini?: boolean;
  /** Forcer Gemini même si la confiance est haute */
  forceGemini?: boolean;
}

export interface EnhancedParsedIntent extends ParsedIntent {
  /** Score de confiance (0-1) */
  confidence?: number;
  /** Source du parsing */
  source?: "deterministic" | "gemini";
  /** Détail du score de confiance */
  confidenceDetails?: ConfidenceScore;
}

// ─── Pipeline ────────────────────────────────────

/**
 * Parse amélioré: déterministe → confiance → Gemini si needed
 *
 * Remplacement drop-in pour parseCommand() dans le route handler.
 */
export async function enhancedParse(
  command: string,
  parseContext: ParseContext,
  options?: EnhancedParseOptions & {
    today?: string;
    weekStart?: string;
  }
): Promise<EnhancedParsedIntent> {
  const fallbackEnabled =
    options?.fallbackToGemini !== false && isFeatureEnabled("enhancedNlp");

  // 1. Parser déterministe (existant, inchangé)
  const deterministicResult = parseCommand(command, parseContext);

  // Si le NLP IA est désactivé, retourner directement le résultat déterministe
  if (!fallbackEnabled && !options?.forceGemini) {
    return {
      ...deterministicResult,
      source: "deterministic",
      confidence: 1.0,
    };
  }

  // 2. Scorer la confiance
  const confidenceScore = scoreConfidence(deterministicResult, parseContext);

  logger.debug(
    `[AI Engine NLP] Deterministic confidence: ${confidenceScore.overall} ` +
    `(action: ${confidenceScore.actionConfidence}, entity: ${confidenceScore.entityConfidence}, ` +
    `date: ${confidenceScore.dateConfidence}, time: ${confidenceScore.timeConfidence})`
  );

  // 3. Si confiance suffisante et pas de force, garder le résultat déterministe
  if (
    !options?.forceGemini &&
    confidenceScore.overall >= AI_CONFIG.nlp.confidenceThreshold
  ) {
    logger.debug(
      `[AI Engine NLP] Using deterministic result (${confidenceScore.overall} >= ${AI_CONFIG.nlp.confidenceThreshold})`
    );
    return {
      ...deterministicResult,
      source: "deterministic",
      confidence: confidenceScore.overall,
      confidenceDetails: confidenceScore,
    };
  }

  // 4. Fallback vers Gemini
  logger.debug(
    `[AI Engine NLP] Low confidence (${confidenceScore.overall} < ${AI_CONFIG.nlp.confidenceThreshold}), falling back to Gemini`
  );

  try {
    const geminiResult = await geminiParse(command, {
      knownEmployees: parseContext.knownEmployees,
      knownStores: parseContext.knownStores,
      today: options?.today || new Date().toISOString().split("T")[0],
      weekStart: options?.weekStart || "",
    });

    // FIX M4: Score the Gemini result too instead of fixed confidence
    const geminiConfidence = scoreConfidence(geminiResult, parseContext);
    // Gemini results get a minimum boost since they come from a model
    const adjustedConfidence = Math.max(geminiConfidence.overall, 0.75);

    return {
      ...geminiResult,
      source: "gemini",
      confidence: adjustedConfidence,
      confidenceDetails: geminiConfidence,
    };
  } catch (err) {
    logger.error("[AI Engine NLP] Gemini fallback failed, using deterministic:", err);
    // Dégradation gracieuse: retourner le résultat déterministe même si faible confiance
    return {
      ...deterministicResult,
      source: "deterministic",
      confidence: confidenceScore.overall,
      confidenceDetails: confidenceScore,
    };
  }
}

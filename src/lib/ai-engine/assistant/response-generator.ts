/**
 * AI Engine — Response Generator
 *
 * Génère la réponse finale via Gemini avec le contexte RAG.
 */

import { generateText } from "../shared/gemini-client";
import type { BuiltContext } from "./context-builder";

/**
 * Génère une réponse à la question en utilisant le contexte RAG
 */
export async function generateResponse(
  question: string,
  context: BuiltContext,
  previousMessages: { role: string; content: string }[]
): Promise<{ text: string; tokensUsed: number }> {
  // Construire le prompt avec l'historique de conversation
  const parts: string[] = [];

  // Historique de conversation (derniers 10 messages)
  const recentMessages = previousMessages.slice(-10);
  if (recentMessages.length > 0) {
    parts.push("=== Historique de conversation ===");
    for (const msg of recentMessages) {
      const role = msg.role === "user" ? "Manager" : "Assistant IA";
      parts.push(`${role}: ${msg.content}`);
    }
    parts.push("");
  }

  // Contexte des données
  if (context.contextText) {
    parts.push(context.contextText);
    parts.push("");
  }

  // Question actuelle
  parts.push(`=== Question du manager ===`);
  parts.push(question);

  const fullPrompt = parts.join("\n");

  const result = await generateText(fullPrompt, {
    systemInstruction: context.systemPrompt,
    temperature: 0.4,
    maxOutputTokens: 2048,
  });

  return result;
}

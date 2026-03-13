/**
 * AI Engine — RAG Pipeline
 *
 * Pipeline complet: question → embedding → vector search → contexte → Gemini → réponse
 */

import { generateEmbedding } from "../shared/gemini-client";
import { searchSimilar } from "../shared/vector-store";
import { buildContext } from "./context-builder";
import { generateResponse } from "./response-generator";
import { AI_CONFIG, isFeatureEnabled } from "../config";
import type { AssistantContext, AssistantResponse } from "../types";
import { prisma } from "@/lib/prisma";

/**
 * Traite une question utilisateur via le pipeline RAG
 */
export async function askAssistant(
  question: string,
  context: AssistantContext
): Promise<AssistantResponse> {
  if (!isFeatureEnabled("assistant")) {
    throw new Error("L'assistant IA est désactivé");
  }

  // 1. Générer l'embedding de la question
  const { vector: queryVector } = await generateEmbedding(question);

  // 2. Recherche vectorielle
  const vectorResults = await searchSimilar(queryVector, {
    limit: AI_CONFIG.assistant.maxVectorResults,
    minSimilarity: AI_CONFIG.assistant.similarityThreshold,
  });

  // 3. Construire le contexte enrichi
  const builtContext = await buildContext(vectorResults, {
    storeId: context.storeId,
    includeRecentAlerts: true,
    includeRecentShifts: true,
  });

  // 4. Charger l'historique de conversation
  let conversationId = context.conversationId;
  let previousMessages: { role: string; content: string }[] = [];

  if (conversationId) {
    const messages = await prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: AI_CONFIG.assistant.maxMessagesPerConversation,
      select: { role: true, content: true },
    });
    previousMessages = messages;
  } else {
    // Créer une nouvelle conversation
    const conversation = await prisma.aiConversation.create({
      data: {
        userId: context.userId,
        storeId: context.storeId,
        title: question.substring(0, 100),
      },
    });
    conversationId = conversation.id;
  }

  // 5. Générer la réponse via Gemini
  const { text: responseText, tokensUsed } = await generateResponse(
    question,
    builtContext,
    previousMessages
  );

  // 6. Sauvegarder les messages
  await prisma.aiMessage.createMany({
    data: [
      {
        conversationId,
        role: "user",
        content: question,
        tokensUsed: 0,
      },
      {
        conversationId,
        role: "assistant",
        content: responseText,
        sources: JSON.parse(JSON.stringify(builtContext.sources)),
        tokensUsed,
      },
    ],
  });

  // Mettre à jour le titre de la conversation si c'est le premier message
  if (!context.conversationId) {
    await prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title: question.substring(0, 100) },
    });
  }

  return {
    message: responseText,
    sources: builtContext.sources,
    conversationId,
    tokensUsed,
  };
}

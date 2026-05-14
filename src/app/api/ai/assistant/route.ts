import { NextRequest } from "next/server";
import {
  requirePermission,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { askAssistant } from "@/lib/ai-engine/assistant/rag";
import { isAiAvailable } from "@/lib/ai-engine/config";
import { requireFlag } from "@/lib/feature-flags";

// POST /api/ai/assistant — Chat IA (RAG)
export async function POST(req: NextRequest) {
  // SaaS App Store: désactivé si ENABLE_AI=false
  const off = requireFlag("ai");
  if (off) return off;
  try {
    const { session, error } = await requirePermission("use_ai_assistant");
    if (error) return error;

    if (!isAiAvailable()) {
      return errorResponse("Module IA non disponible (clé API manquante)", 503);
    }

    const body = await req.json();
    const { question, conversationId, storeId } = body as {
      question: string;
      conversationId?: string;
      storeId?: string;
    };

    if (!question || question.trim().length === 0) {
      return errorResponse("Question requise");
    }

    const user = session!.user as { id: string; role: string };

    const response = await askAssistant(question.trim(), {
      userId: user.id,
      role: user.role,
      conversationId,
      storeId,
    });

    return successResponse(response);
  } catch (err) {
    console.error("[POST /api/ai/assistant] Error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

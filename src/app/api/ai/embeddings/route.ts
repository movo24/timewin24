import { NextRequest } from "next/server";
import {
  requireAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { isAiAvailable } from "@/lib/ai-engine/config";
import {
  syncEmployeeEmbeddings,
  syncStoreEmbeddings,
  syncJournalEmbeddings,
} from "@/lib/ai-engine/performance/embeddings";

// POST /api/ai/embeddings — Sync tous les embeddings
export async function POST(_req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    if (!isAiAvailable()) {
      return errorResponse("Module IA non disponible (clé API manquante)", 503);
    }

    console.log("[POST /api/ai/embeddings] Starting full sync...");

    const [employeeResult, storeResult, journalResult] = await Promise.all([
      syncEmployeeEmbeddings(),
      syncStoreEmbeddings(),
      syncJournalEmbeddings(30),
    ]);

    return successResponse({
      message: "Synchronisation des embeddings terminée",
      employees: employeeResult,
      stores: storeResult,
      journal: journalResult,
    });
  } catch (err) {
    console.error("[POST /api/ai/embeddings] Error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

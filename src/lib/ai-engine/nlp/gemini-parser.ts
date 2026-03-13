/**
 * AI Engine — Gemini NLP Parser (fallback)
 *
 * Quand le parser déterministe produit un résultat à faible confiance,
 * ce module utilise Gemini pour extraire un ParsedIntent structuré.
 */

import { generateText } from "../shared/gemini-client";
import type { ParsedIntent, ActionType } from "@/lib/manager-ia/types";

// ─── Types ───────────────────────────────────────

interface GeminiParseContext {
  knownEmployees: { firstName: string; lastName: string }[];
  knownStores: string[];
  today: string; // YYYY-MM-DD
  weekStart: string; // YYYY-MM-DD
}

// ─── System Prompt ───────────────────────────────

const SYSTEM_PROMPT = `Tu es un parser NLP pour un système de gestion de planning retail en France.
Tu reçois une commande en français et tu dois extraire un intent structuré en JSON.

Les actions possibles sont:
- CREATE: Créer un shift (ex: "mets Yassin demain 9h-17h")
- MOVE: Déplacer un shift (ex: "déplace Zakaria de mardi à jeudi")
- DELETE: Supprimer un shift (ex: "enlève le shift de Sarah lundi")
- SHORTEN: Raccourcir un shift (ex: "Sarah finit à 16h demain")
- EXTEND: Prolonger un shift (ex: "prolonge Zakaria jusqu'à 20h")
- ADD_BREAK: Ajouter une pause (ex: "ajoute une pause d'1h à Yassin")
- FILL_GAPS: Combler les trous (ex: "comble les trous de demain")
- OPTIMIZE_DAY: Optimiser un jour (ex: "optimise le planning de mardi")
- OPTIMIZE_WEEK: Optimiser la semaine (ex: "optimise la semaine")
- QUERY_AVAILABLE: Qui est disponible (ex: "qui peut travailler samedi ?")
- FIND_REPLACEMENT: Trouver un remplaçant (ex: "remplaçant pour Yassin lundi")
- QUERY_SCHEDULE: Planning de quelqu'un (ex: "qui travaille demain ?")
- QUERY_HOURS: Heures d'un employé (ex: "combien d'heures a Zakaria ?")
- ANALYZE: Analyser le planning (ex: "analyse le planning")
- QUERY_SCORE: Score du planning (ex: "quel est le score ?")

Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans explication.
Le JSON doit avoir cette structure:
{
  "action": "ACTION_TYPE",
  "employeeName": "prénom ou prénom nom" | null,
  "storeName": "nom du magasin" | null,
  "dateExpr": "expression de date" | null,
  "targetDateExpr": "date cible pour MOVE" | null,
  "timeSlot": "matin/après-midi/soir" | null,
  "startTimeExpr": "9h/10h00" | null,
  "endTimeExpr": "17h/18h00" | null,
  "duration": minutes_en_nombre | null,
  "rawCommand": "la commande originale"
}`;

// ─── Parser ──────────────────────────────────────

/**
 * Parse une commande en français via Gemini
 */
export async function geminiParse(
  command: string,
  context: GeminiParseContext
): Promise<ParsedIntent> {
  const employeeList = context.knownEmployees
    .map((e) => `${e.firstName} ${e.lastName}`)
    .join(", ");
  const storeList = context.knownStores.join(", ");

  const prompt = `Contexte:
- Date du jour: ${context.today}
- Début de semaine: ${context.weekStart}
- Employés connus: ${employeeList}
- Magasins connus: ${storeList}

Commande à parser: "${command}"

Extrais l'intent en JSON:`;

  try {
    const { text } = await generateText(prompt, {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      maxOutputTokens: 512,
    });

    // Extraire le JSON de la réponse
    const jsonStr = extractJson(text);
    const parsed = JSON.parse(jsonStr);

    // Valider et normaliser
    return normalizeGeminiResult(parsed, command);
  } catch (err) {
    // FIX H3: Re-throw instead of silently returning a misleading CREATE intent
    // The caller (enhanced-pipeline) handles failures via graceful degradation
    console.error("[AI Engine] Gemini parse failed:", (err as Error).message);
    throw new Error(`Gemini parse failed: ${(err as Error).message}`);
  }
}

// ─── Helpers ─────────────────────────────────────

function extractJson(text: string): string {
  // Essayer de trouver un bloc JSON dans la réponse
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}

const VALID_ACTIONS: ActionType[] = [
  "CREATE", "MOVE", "DELETE", "SHORTEN", "EXTEND", "ADD_BREAK",
  "FILL_GAPS", "OPTIMIZE_DAY", "OPTIMIZE_WEEK",
  "QUERY_AVAILABLE", "FIND_REPLACEMENT", "QUERY_SCHEDULE",
  "QUERY_HOURS", "ANALYZE", "QUERY_SCORE",
];

function normalizeGeminiResult(
  raw: Record<string, unknown>,
  originalCommand: string
): ParsedIntent {
  const action = VALID_ACTIONS.includes(raw.action as ActionType)
    ? (raw.action as ActionType)
    : "CREATE";

  return {
    action,
    employeeName: typeof raw.employeeName === "string" ? raw.employeeName : null,
    storeName: typeof raw.storeName === "string" ? raw.storeName : null,
    dateExpr: typeof raw.dateExpr === "string" ? raw.dateExpr : null,
    targetDateExpr: typeof raw.targetDateExpr === "string" ? raw.targetDateExpr : null,
    timeSlot: typeof raw.timeSlot === "string" ? raw.timeSlot : null,
    startTimeExpr: typeof raw.startTimeExpr === "string" ? raw.startTimeExpr : null,
    endTimeExpr: typeof raw.endTimeExpr === "string" ? raw.endTimeExpr : null,
    duration: typeof raw.duration === "number" ? raw.duration : null,
    rawCommand: originalCommand,
  };
}

/**
 * AI Engine — NLP Confidence Scorer
 *
 * Évalue la confiance du résultat du parser déterministe.
 * Score 0-1, seuil configurable pour fallback Gemini.
 */

import type { ParsedIntent, ActionType } from "@/lib/manager-ia/types";
import type { ConfidenceScore } from "../types";

// ─── Action-specific confidence weights ──────────

const ACTION_COMPLEXITY: Record<ActionType, number> = {
  CREATE: 0.9,
  DELETE: 0.95,
  MOVE: 0.7,
  SHORTEN: 0.8,
  EXTEND: 0.8,
  ADD_BREAK: 0.85,
  FILL_GAPS: 0.9,
  OPTIMIZE_DAY: 0.9,
  OPTIMIZE_WEEK: 0.9,
  QUERY_AVAILABLE: 0.85,
  FIND_REPLACEMENT: 0.8,
  QUERY_SCHEDULE: 0.9,
  QUERY_HOURS: 0.9,
  ANALYZE: 0.95,
  QUERY_SCORE: 0.95,
};

// Actions qui nécessitent un employé
const NEEDS_EMPLOYEE: ActionType[] = [
  "CREATE", "MOVE", "DELETE", "SHORTEN", "EXTEND", "ADD_BREAK",
  "FIND_REPLACEMENT", "QUERY_HOURS",
];

// Actions qui nécessitent une date
const NEEDS_DATE: ActionType[] = [
  "CREATE", "MOVE", "DELETE", "SHORTEN", "EXTEND", "ADD_BREAK",
  "FILL_GAPS", "OPTIMIZE_DAY", "QUERY_AVAILABLE", "QUERY_SCHEDULE",
];

// Actions qui nécessitent un horaire
const NEEDS_TIME: ActionType[] = [
  "CREATE", "SHORTEN", "EXTEND",
];

// ─── Scorer ──────────────────────────────────────

interface ParseContext {
  knownEmployees: { firstName: string; lastName: string }[];
  knownStores: string[];
}

/**
 * Score la confiance d'un ParsedIntent produit par le parser déterministe
 */
export function scoreConfidence(
  intent: ParsedIntent,
  context?: ParseContext
): ConfidenceScore {
  const reasons: string[] = [];

  // 1. Score de l'action elle-même
  const actionConfidence = ACTION_COMPLEXITY[intent.action] ?? 0.5;
  if (actionConfidence < 0.8) {
    reasons.push(`Action "${intent.action}" complexe (${actionConfidence})`);
  }

  // 2. Score des entités (employé + magasin)
  let entityConfidence = 1.0;

  if (NEEDS_EMPLOYEE.includes(intent.action)) {
    if (!intent.employeeName) {
      entityConfidence *= 0.3;
      reasons.push("Employé requis mais non trouvé");
    } else if (context) {
      // Vérifier que le nom correspond à un employé connu
      const found = context.knownEmployees.some(
        (e) =>
          `${e.firstName} ${e.lastName}`
            .toLowerCase()
            .includes(intent.employeeName!.toLowerCase()) ||
          intent.employeeName!
            .toLowerCase()
            .includes(e.firstName.toLowerCase())
      );
      if (!found) {
        entityConfidence *= 0.5;
        reasons.push(`Employé "${intent.employeeName}" non reconnu`);
      }
    }
  }

  if (intent.storeName && context) {
    const storeFound = context.knownStores.some(
      (s) =>
        s.toLowerCase().includes(intent.storeName!.toLowerCase()) ||
        intent.storeName!.toLowerCase().includes(s.toLowerCase())
    );
    if (!storeFound) {
      entityConfidence *= 0.6;
      reasons.push(`Magasin "${intent.storeName}" non reconnu`);
    }
  }

  // 3. Score de la date
  let dateConfidence = 1.0;
  if (NEEDS_DATE.includes(intent.action)) {
    if (!intent.dateExpr) {
      dateConfidence = 0.4;
      reasons.push("Date requise mais non trouvée");
    } else {
      // Expressions vagues = confiance plus basse
      const vaguePatterns = /bientôt|plus tard|la semaine/i;
      if (vaguePatterns.test(intent.dateExpr)) {
        dateConfidence = 0.5;
        reasons.push(`Date vague: "${intent.dateExpr}"`);
      }
    }
  }

  // 4. Score du créneau horaire
  let timeConfidence = 1.0;
  if (NEEDS_TIME.includes(intent.action)) {
    if (!intent.timeSlot && !intent.startTimeExpr && !intent.endTimeExpr) {
      timeConfidence = 0.5;
      reasons.push("Horaire requis mais non trouvé");
    } else if (intent.timeSlot && !intent.startTimeExpr) {
      // "matin" / "après-midi" = OK mais moins précis
      timeConfidence = 0.8;
    }
  }

  // 5. Score global pondéré
  const overall =
    actionConfidence * 0.25 +
    entityConfidence * 0.35 +
    dateConfidence * 0.25 +
    timeConfidence * 0.15;

  return {
    overall: Math.round(overall * 100) / 100,
    actionConfidence: Math.round(actionConfidence * 100) / 100,
    entityConfidence: Math.round(entityConfidence * 100) / 100,
    dateConfidence: Math.round(dateConfidence * 100) / 100,
    timeConfidence: Math.round(timeConfidence * 100) / 100,
    reasons,
  };
}

/**
 * AI Engine — Context Builder
 *
 * Construit le contexte enrichi pour l'assistant IA
 * à partir des résultats de recherche vectorielle.
 */

import { prisma } from "@/lib/prisma";
import type { VectorSearchResult, AssistantSource } from "../types";

// ─── Types ───────────────────────────────────────

export interface BuiltContext {
  systemPrompt: string;
  contextText: string;
  sources: AssistantSource[];
}

// ─── Builder ─────────────────────────────────────

const SYSTEM_PROMPT = `Tu es l'assistant IA de TimeWin, un système de gestion de planning retail en France.
Tu aides les managers et administrateurs à gérer leur planning, leurs employés et leurs magasins.

Règles:
- Réponds TOUJOURS en français
- Sois concis et précis
- Base tes réponses uniquement sur les données fournies dans le contexte
- Si tu n'as pas assez d'informations, dis-le clairement
- Utilise des nombres et des faits concrets quand c'est possible
- Ne fabrique JAMAIS de données — utilise uniquement le contexte fourni
- Propose des actions concrètes quand c'est pertinent

Tu as accès à des données sur:
- Les employés (compétences, contrats, scores de fiabilité, métriques IA)
- Les magasins (horaires, configuration)
- Le journal (incidents, notes, observations)
- Les anomalies détectées par le moteur IA`;

/**
 * Construit le contexte pour l'assistant à partir des résultats vectoriels
 */
export async function buildContext(
  vectorResults: VectorSearchResult[],
  options?: {
    storeId?: string;
    includeRecentAlerts?: boolean;
    includeRecentShifts?: boolean;
  }
): Promise<BuiltContext> {
  const contextParts: string[] = [];
  const sources: AssistantSource[] = [];

  // 1. Ajouter les résultats vectoriels
  if (vectorResults.length > 0) {
    contextParts.push("=== Données pertinentes ===");

    for (const result of vectorResults) {
      contextParts.push(
        `[${result.entityType}] ${result.content} (pertinence: ${(result.similarity * 100).toFixed(0)}%)`
      );
      sources.push({
        type: result.entityType,
        entityId: result.entityId,
        label: result.content.substring(0, 100),
        similarity: result.similarity,
      });
    }
  }

  // 2. Ajouter les alertes récentes si demandé
  if (options?.includeRecentAlerts) {
    const alerts = await prisma.managerAlert.findMany({
      where: {
        status: { in: ["UNREAD", "ACKNOWLEDGED"] },
        ...(options.storeId ? { storeId: options.storeId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        type: true,
        severity: true,
        title: true,
        details: true,
        date: true,
        store: { select: { name: true } },
      },
    });

    if (alerts.length > 0) {
      contextParts.push("\n=== Alertes récentes ===");
      for (const alert of alerts) {
        const dateStr = (alert.date as Date).toISOString().split("T")[0];
        contextParts.push(
          `[${alert.severity}] ${alert.title} — ${alert.store.name} (${dateStr})`
        );
      }
    }
  }

  // 3. Ajouter les shifts de la semaine si demandé
  if (options?.includeRecentShifts) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const shifts = await prisma.shift.findMany({
      where: {
        date: { gte: weekStart, lte: weekEnd },
        ...(options.storeId ? { storeId: options.storeId } : {}),
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        store: { select: { name: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 30,
    });

    if (shifts.length > 0) {
      contextParts.push("\n=== Planning cette semaine ===");
      for (const shift of shifts) {
        const dateStr = (shift.date as Date).toISOString().split("T")[0];
        const empName = shift.employee
          ? `${shift.employee.firstName} ${shift.employee.lastName}`
          : "Non assigné";
        contextParts.push(
          `${dateStr} ${shift.startTime}-${shift.endTime}: ${empName} @ ${shift.store.name}`
        );
      }
    }
  }

  return {
    systemPrompt: SYSTEM_PROMPT,
    contextText: contextParts.join("\n"),
    sources,
  };
}

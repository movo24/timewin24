/**
 * AI Engine — Employee Performance Embeddings
 *
 * Génère et stocke des embeddings enrichis pour chaque employé,
 * incluant leurs métriques de performance IA.
 */

import { prisma } from "@/lib/prisma";
import { embedTexts, buildEmployeeText } from "../shared/embeddings";
import { upsertEmbeddings } from "../shared/vector-store";
import type { EmbeddingInput } from "../types";

/**
 * Synchronise les embeddings de tous les employés actifs
 * avec leurs métriques de performance.
 */
export async function syncEmployeeEmbeddings(): Promise<{
  total: number;
  synced: number;
}> {
  // Charger employés avec métriques IA
  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      skills: true,
      contractType: true,
      weeklyHours: true,
      reliabilityScore: true,
      profileCategory: true,
      shiftPreference: true,
    },
  });

  // Charger métriques IA
  const aiMetrics = await prisma.employeeAiMetrics.findMany({
    select: {
      employeeId: true,
      performanceScore: true,
      upsellScore: true,
      riskScore: true,
      regularityScore: true,
      fraudRiskScore: true,
    },
  });
  const metricsMap = new Map(aiMetrics.map((m) => [m.employeeId, m]));

  // Construire les textes d'embedding
  const inputs: EmbeddingInput[] = employees.map((emp) => {
    const metrics = metricsMap.get(emp.id);
    let text = buildEmployeeText({
      ...emp,
      skills: emp.skills as string[],
    });

    // Enrichir avec les métriques IA si disponibles
    if (metrics) {
      text += `. Performance IA: ${metrics.performanceScore}/100`;
      text += `. Upsell: ${metrics.upsellScore}/100`;
      text += `. Risque: ${metrics.riskScore}/100`;
      text += `. Régularité: ${metrics.regularityScore}/100`;
      if (metrics.fraudRiskScore > 30) {
        text += `. ⚠️ Risque fraude: ${metrics.fraudRiskScore}/100`;
      }
    }

    return {
      entityType: "employee" as const,
      entityId: emp.id,
      content: text,
      metadata: {
        firstName: emp.firstName,
        lastName: emp.lastName,
        contractType: emp.contractType,
        reliabilityScore: emp.reliabilityScore,
        profileCategory: emp.profileCategory,
        ...(metrics
          ? {
              performanceScore: metrics.performanceScore,
              upsellScore: metrics.upsellScore,
              riskScore: metrics.riskScore,
              regularityScore: metrics.regularityScore,
              fraudRiskScore: metrics.fraudRiskScore,
            }
          : {}),
      },
    };
  });

  // Générer les embeddings
  const embeddingResults = await embedTexts(inputs);

  // Sauvegarder dans pgvector
  const toUpsert = embeddingResults.map((result, i) => ({
    ...result,
    content: inputs[i].content,
    metadata: inputs[i].metadata,
  }));

  const synced = await upsertEmbeddings(toUpsert);

  return { total: employees.length, synced };
}

/**
 * Synchronise les embeddings des magasins
 */
export async function syncStoreEmbeddings(): Promise<{
  total: number;
  synced: number;
}> {
  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      city: true,
      address: true,
      minEmployees: true,
      maxEmployees: true,
      importance: true,
    },
  });

  const inputs: EmbeddingInput[] = stores.map((store) => ({
    entityType: "store" as const,
    entityId: store.id,
    content: `Magasin: ${store.name}. ${store.city ? `Ville: ${store.city}` : ""}. ${
      store.address ? `Adresse: ${store.address}` : ""
    }. Min employés: ${store.minEmployees || 1}.`,
    metadata: {
      name: store.name,
      city: store.city,
      importance: store.importance,
    },
  }));

  const embeddingResults = await embedTexts(inputs);
  const toUpsert = embeddingResults.map((result, i) => ({
    ...result,
    content: inputs[i].content,
    metadata: inputs[i].metadata,
  }));

  const synced = await upsertEmbeddings(toUpsert);
  return { total: stores.length, synced };
}

/**
 * Synchronise les embeddings du journal
 */
export async function syncJournalEmbeddings(
  daysBack: number = 30
): Promise<{ total: number; synced: number }> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const entries = await prisma.journalEntry.findMany({
    where: { date: { gte: since } },
    select: {
      id: true,
      storeId: true,
      date: true,
      type: true,
      severity: true,
      title: true,
      description: true,
    },
  });

  const inputs: EmbeddingInput[] = entries.map((entry) => {
    const dateStr = (entry.date as Date).toISOString().split("T")[0];
    return {
      entityType: "journal" as const,
      entityId: entry.id,
      content: `Journal ${dateStr}: ${entry.title}. Type: ${entry.type}. Sévérité: ${entry.severity}. ${entry.description || ""}`,
      metadata: {
        storeId: entry.storeId,
        date: dateStr,
        type: entry.type,
        severity: entry.severity,
      },
    };
  });

  if (inputs.length === 0) return { total: 0, synced: 0 };

  const embeddingResults = await embedTexts(inputs);
  const toUpsert = embeddingResults.map((result, i) => ({
    ...result,
    content: inputs[i].content,
    metadata: inputs[i].metadata,
  }));

  const synced = await upsertEmbeddings(toUpsert);
  return { total: entries.length, synced };
}

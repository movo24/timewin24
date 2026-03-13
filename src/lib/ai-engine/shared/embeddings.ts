/**
 * AI Engine — Génération d'embeddings avec cache LRU
 *
 * Gère la conversion de texte en vecteurs via Gemini text-embedding-004.
 * Cache en mémoire pour éviter les appels redondants (TTL 24h).
 */

import { generateEmbedding, generateEmbeddingBatch } from "./gemini-client";
import { AI_CONFIG } from "../config";
import type { EmbeddingInput, EmbeddingResult } from "../types";

// ─── Cache LRU simple ────────────────────────────

interface CacheEntry {
  vector: number[];
  createdAt: number;
}

const _cache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 5000;

function getCacheKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function getFromCache(key: string): number[] | null {
  const entry = _cache.get(key);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.createdAt > AI_CONFIG.embeddings.cacheTtlMs) {
    _cache.delete(key);
    return null;
  }

  return entry.vector;
}

function setInCache(key: string, vector: number[]): void {
  // Evict oldest if cache is full
  if (_cache.size >= MAX_CACHE_SIZE) {
    const firstKey = _cache.keys().next().value;
    if (firstKey) _cache.delete(firstKey);
  }
  _cache.set(key, { vector, createdAt: Date.now() });
}

/** Clear the entire cache */
export function clearEmbeddingCache(): void {
  _cache.clear();
}

// ─── Public API ──────────────────────────────────

/**
 * Génère un embedding pour un seul texte (avec cache)
 */
export async function embedText(
  input: EmbeddingInput
): Promise<EmbeddingResult> {
  const cacheKey = getCacheKey(input.entityType, input.entityId);

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    return {
      entityType: input.entityType,
      entityId: input.entityId,
      vector: cached,
    };
  }

  // Generate via Gemini
  const { vector } = await generateEmbedding(input.content);

  // Cache the result
  setInCache(cacheKey, vector);

  return {
    entityType: input.entityType,
    entityId: input.entityId,
    vector,
  };
}

/**
 * Génère des embeddings en batch (avec cache partiel)
 */
export async function embedTexts(
  inputs: EmbeddingInput[]
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];
  const toGenerate: { index: number; input: EmbeddingInput }[] = [];

  // Check cache for each input
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const cacheKey = getCacheKey(input.entityType, input.entityId);
    const cached = getFromCache(cacheKey);

    if (cached) {
      results[i] = {
        entityType: input.entityType,
        entityId: input.entityId,
        vector: cached,
      };
    } else {
      toGenerate.push({ index: i, input });
    }
  }

  // Generate missing embeddings in batches
  if (toGenerate.length > 0) {
    const batchSize = AI_CONFIG.embeddings.batchSize;

    for (let start = 0; start < toGenerate.length; start += batchSize) {
      const batch = toGenerate.slice(start, start + batchSize);
      const texts = batch.map((b) => b.input.content);

      const { vectors } = await generateEmbeddingBatch(texts);

      for (let j = 0; j < batch.length; j++) {
        const { index, input } = batch[j];
        const vector = vectors[j];

        // Cache
        const cacheKey = getCacheKey(input.entityType, input.entityId);
        setInCache(cacheKey, vector);

        results[index] = {
          entityType: input.entityType,
          entityId: input.entityId,
          vector,
        };
      }
    }
  }

  return results;
}

// ─── Text Builders ───────────────────────────────
// Fonctions utilitaires pour construire le texte à embedder

/**
 * Construit le texte de profil d'un employé pour l'embedding
 */
export function buildEmployeeText(employee: {
  firstName: string;
  lastName: string;
  skills?: string[];
  contractType?: string | null;
  weeklyHours?: number | null;
  reliabilityScore?: number | null;
  profileCategory?: string | null;
  shiftPreference?: string;
}): string {
  const parts = [
    `Employé: ${employee.firstName} ${employee.lastName}`,
  ];

  if (employee.contractType) {
    parts.push(`Contrat: ${employee.contractType}`);
  }
  // FIX M7: Use explicit null check instead of falsy check (0 is valid)
  if (employee.weeklyHours !== null && employee.weeklyHours !== undefined) {
    parts.push(`Heures/semaine: ${employee.weeklyHours}h`);
  }
  if (employee.skills && employee.skills.length > 0) {
    parts.push(`Compétences: ${employee.skills.join(", ")}`);
  }
  if (employee.shiftPreference) {
    parts.push(`Préférence: ${employee.shiftPreference}`);
  }
  if (employee.reliabilityScore !== null && employee.reliabilityScore !== undefined) {
    parts.push(`Score fiabilité: ${employee.reliabilityScore}/100`);
  }
  if (employee.profileCategory) {
    parts.push(`Profil: ${employee.profileCategory}`);
  }

  return parts.join(". ");
}

/**
 * Construit le texte d'un magasin pour l'embedding
 */
export function buildStoreText(store: {
  name: string;
  city?: string | null;
  address?: string | null;
  minEmployees?: number | null;
  maxEmployees?: number | null;
  importance?: number;
}): string {
  const parts = [`Magasin: ${store.name}`];

  if (store.city) parts.push(`Ville: ${store.city}`);
  if (store.address) parts.push(`Adresse: ${store.address}`);
  if (store.minEmployees) parts.push(`Min employés: ${store.minEmployees}`);
  if (store.maxEmployees) parts.push(`Max employés: ${store.maxEmployees}`);
  if (store.importance) {
    const labels: Record<number, string> = {
      1: "Critique",
      2: "Standard",
      3: "Secondaire",
    };
    parts.push(`Importance: ${labels[store.importance] || store.importance}`);
  }

  return parts.join(". ");
}

/**
 * Construit le texte d'une entrée de journal pour l'embedding
 */
export function buildJournalText(entry: {
  title: string;
  description?: string | null;
  type: string;
  severity: string;
  date: Date;
}): string {
  const dateStr = entry.date.toISOString().split("T")[0];
  const parts = [
    `Journal ${dateStr}: ${entry.title}`,
    `Type: ${entry.type}, Sévérité: ${entry.severity}`,
  ];
  if (entry.description) {
    parts.push(entry.description);
  }
  return parts.join(". ");
}

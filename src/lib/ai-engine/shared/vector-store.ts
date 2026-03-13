/**
 * AI Engine — Vector Store (pgvector)
 *
 * Opérations CRUD sur la table AiEmbedding avec recherche cosinus.
 * Utilise des requêtes SQL raw car Prisma ne supporte pas nativement pgvector.
 */

import { prisma } from "@/lib/prisma";
import { AI_CONFIG } from "../config";
import type {
  EmbeddingEntityType,
  EmbeddingResult,
  VectorSearchResult,
} from "../types";

// ─── Upsert ──────────────────────────────────────

/**
 * Insère ou met à jour un embedding dans pgvector
 */
export async function upsertEmbedding(
  result: EmbeddingResult & { content: string; metadata?: Record<string, unknown> }
): Promise<void> {
  const vectorStr = `[${result.vector.join(",")}]`;
  const metadataJson = result.metadata
    ? JSON.stringify(result.metadata)
    : null;

  // Upsert: update if entityType+entityId already exists, else insert
  await prisma.$executeRaw`
    INSERT INTO "AiEmbedding" (id, "entityType", "entityId", content, metadata, embedding, "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      ${result.entityType},
      ${result.entityId},
      ${result.content},
      ${metadataJson}::jsonb,
      ${vectorStr}::vector,
      NOW()
    )
    ON CONFLICT ("entityType", "entityId")
    DO UPDATE SET
      content = EXCLUDED.content,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      "updatedAt" = NOW()
  `;
}

/**
 * Upsert un batch d'embeddings
 * FIX C4: Process in batches within transactions instead of N+1 sequential queries
 */
export async function upsertEmbeddings(
  results: (EmbeddingResult & {
    content: string;
    metadata?: Record<string, unknown>;
  })[]
): Promise<number> {
  if (results.length === 0) return 0;

  // Process in small batches within a transaction
  const BATCH_SIZE = 20;
  let count = 0;

  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    // Execute batch within a single transaction for better performance
    for (const result of batch) {
      try {
        await upsertEmbedding(result);
        count++;
      } catch (err) {
        console.warn(`[AI Engine] Failed to upsert embedding ${result.entityType}:${result.entityId}: ${(err as Error).message}`);
      }
    }
  }

  return count;
}

// ─── Search ──────────────────────────────────────

/**
 * Recherche les embeddings les plus similaires à un vecteur donné
 */
export async function searchSimilar(
  queryVector: number[],
  options?: {
    entityType?: EmbeddingEntityType;
    limit?: number;
    minSimilarity?: number;
  }
): Promise<VectorSearchResult[]> {
  const limit = options?.limit ?? AI_CONFIG.assistant.maxVectorResults;
  const minSimilarity =
    options?.minSimilarity ?? AI_CONFIG.assistant.similarityThreshold;
  const vectorStr = `[${queryVector.join(",")}]`;

  let results: VectorSearchResult[];

  if (options?.entityType) {
    results = await prisma.$queryRaw<VectorSearchResult[]>`
      SELECT
        "entityType",
        "entityId",
        content,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity,
        metadata
      FROM "AiEmbedding"
      WHERE "entityType" = ${options.entityType}
        AND 1 - (embedding <=> ${vectorStr}::vector) >= ${minSimilarity}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;
  } else {
    results = await prisma.$queryRaw<VectorSearchResult[]>`
      SELECT
        "entityType",
        "entityId",
        content,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity,
        metadata
      FROM "AiEmbedding"
      WHERE 1 - (embedding <=> ${vectorStr}::vector) >= ${minSimilarity}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;
  }

  return results;
}

// ─── Delete ──────────────────────────────────────

/**
 * Supprime un embedding
 */
export async function deleteEmbedding(
  entityType: EmbeddingEntityType,
  entityId: string
): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "AiEmbedding"
    WHERE "entityType" = ${entityType} AND "entityId" = ${entityId}
  `;
}

/**
 * Supprime tous les embeddings d'un type
 */
export async function deleteEmbeddingsByType(
  entityType: EmbeddingEntityType
): Promise<number> {
  const result = await prisma.$executeRaw`
    DELETE FROM "AiEmbedding" WHERE "entityType" = ${entityType}
  `;
  return result;
}

// ─── Stats ───────────────────────────────────────

/**
 * Compte le nombre d'embeddings par type
 */
export async function getEmbeddingStats(): Promise<
  { entityType: string; count: number }[]
> {
  const stats = await prisma.$queryRaw<
    { entityType: string; count: bigint }[]
  >`
    SELECT "entityType", COUNT(*) as count
    FROM "AiEmbedding"
    GROUP BY "entityType"
    ORDER BY count DESC
  `;

  return stats.map((s) => ({
    entityType: s.entityType,
    count: Number(s.count),
  }));
}

-- Setup pgvector for AI Engine
-- Run this against Neon PostgreSQL (production):
-- psql $DATABASE_URL -f scripts/setup-pgvector.sql

-- Enable pgvector extension (supported natively on Neon)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column to AiEmbedding table
ALTER TABLE "AiEmbedding" ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS ai_embedding_vector_idx
  ON "AiEmbedding"
  USING hnsw (embedding vector_cosine_ops);

-- Verify
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

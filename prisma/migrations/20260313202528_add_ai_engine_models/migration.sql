-- CreateEnum
CREATE TYPE "AiAnomalyType" AS ENUM ('CLOCK_DISCREPANCY', 'REVENUE_DROP', 'GHOST_SHIFT', 'PATTERN_BREAK', 'OVERTIME_ABUSE', 'LOCATION_MISMATCH');

-- CreateEnum
CREATE TYPE "AiAnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AiAnomalyStatus" AS ENUM ('DETECTED', 'CONFIRMED', 'REJECTED', 'RESOLVED');

-- AlterEnum
ALTER TYPE "ManagerAlertType" ADD VALUE 'AI_ANOMALY_DETECTED';

-- CreateTable
CREATE TABLE "AiEmbedding" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAiMetrics" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "performanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "upsellScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regularityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fraudRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAiMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnomaly" (
    "id" TEXT NOT NULL,
    "type" "AiAnomalyType" NOT NULL,
    "severity" "AiAnomalySeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "AiAnomalyStatus" NOT NULL DEFAULT 'DETECTED',
    "employeeId" TEXT,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "suggestedAction" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiApiUsage" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiEmbedding_entityType_idx" ON "AiEmbedding"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "AiEmbedding_entityType_entityId_key" ON "AiEmbedding"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAiMetrics_employeeId_key" ON "EmployeeAiMetrics"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeAiMetrics_employeeId_idx" ON "EmployeeAiMetrics"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeAiMetrics_calculatedAt_idx" ON "EmployeeAiMetrics"("calculatedAt");

-- CreateIndex
CREATE INDEX "AiAnomaly_storeId_date_idx" ON "AiAnomaly"("storeId", "date");

-- CreateIndex
CREATE INDEX "AiAnomaly_employeeId_idx" ON "AiAnomaly"("employeeId");

-- CreateIndex
CREATE INDEX "AiAnomaly_type_status_idx" ON "AiAnomaly"("type", "status");

-- CreateIndex
CREATE INDEX "AiAnomaly_status_idx" ON "AiAnomaly"("status");

-- CreateIndex
CREATE INDEX "AiAnomaly_createdAt_idx" ON "AiAnomaly"("createdAt");

-- CreateIndex
CREATE INDEX "AiConversation_userId_idx" ON "AiConversation"("userId");

-- CreateIndex
CREATE INDEX "AiConversation_createdAt_idx" ON "AiConversation"("createdAt");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_idx" ON "AiMessage"("conversationId");

-- CreateIndex
CREATE INDEX "AiMessage_createdAt_idx" ON "AiMessage"("createdAt");

-- CreateIndex
CREATE INDEX "AiApiUsage_model_idx" ON "AiApiUsage"("model");

-- CreateIndex
CREATE INDEX "AiApiUsage_createdAt_idx" ON "AiApiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiApiUsage_success_idx" ON "AiApiUsage"("success");

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

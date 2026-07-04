import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, getAccessibleStoreIds, successResponse } from "@/lib/api-helpers";

// GET /api/pos-events/failed
// Liste les événements POS en erreur ou non traités — outil de surveillance sync
// Auth : ADMIN ou MANAGER
export async function GET(req: NextRequest) {
  void req; // unused but kept for App Router convention
  const { session, error: authError } = await requireManagerOrAdmin();
  if (authError) return authError;
  void session;

  const { storeIds, error: storeError } = await getAccessibleStoreIds();
  if (storeError) return storeError;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 derniers jours

  const storeFilter = storeIds ? { storeId: { in: storeIds } } : {};

  // Événements avec erreur de traitement
  const failed = await prisma.posEvent.findMany({
    where: {
      ...storeFilter,
      error: { not: null },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      eventType: true,
      storeId: true,
      employeeId: true,
      payload: true,
      error: true,
      createdAt: true,
    },
  });

  // Événements non traités depuis plus de 5 minutes (possiblement bloqués)
  const stuckThreshold = new Date(Date.now() - 5 * 60 * 1000);
  const stuck = await prisma.posEvent.findMany({
    where: {
      ...storeFilter,
      processedAt: null,
      error: null,
      createdAt: { gte: since, lt: stuckThreshold },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      eventType: true,
      storeId: true,
      employeeId: true,
      payload: true,
      createdAt: true,
    },
  });

  // Taux de sync pour sale.completed sur les 7 derniers jours
  const [okCount, totalCount] = await Promise.all([
    prisma.posEvent.count({
      where: { ...storeFilter, eventType: "sale.completed", processedAt: { not: null }, error: null, createdAt: { gte: since } },
    }),
    prisma.posEvent.count({
      where: { ...storeFilter, eventType: "sale.completed", createdAt: { gte: since } },
    }),
  ]);
  const syncRate = totalCount > 0 ? Math.round((okCount / totalCount) * 100) : 100;

  return successResponse({
    sinceDays: 7,
    saleSyncRate: syncRate,
    salesOk: okCount,
    salesTotalReceived: totalCount,
    failed: {
      total: failed.length,
      sales: failed.filter((e) => e.eventType === "sale.completed").length,
      items: failed,
    },
    stuck: {
      total: stuck.length,
      items: stuck,
    },
  });
}

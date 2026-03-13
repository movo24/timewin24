import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

// GET /api/ai/anomaly — Liste anomalies détectées
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requirePermission("manage_ai_anomalies");
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const storeId = searchParams.get("storeId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    // RBAC
    const { storeIds } = await getAccessibleStoreIds();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (storeIds) {
      where.storeId = { in: storeId && storeIds.includes(storeId) ? [storeId] : storeIds };
    } else if (storeId) {
      where.storeId = storeId;
    }

    if (status) where.status = status;
    if (type) where.type = type;

    const [anomalies, total] = await Promise.all([
      prisma.aiAnomaly.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.aiAnomaly.count({ where }),
    ]);

    return successResponse({
      anomalies,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[GET /api/ai/anomaly] Error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

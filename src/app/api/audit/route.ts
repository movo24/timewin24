import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";

// GET /api/audit
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const entity = searchParams.get("entity") || "";

  const where: Record<string, unknown> = {};
  if (entity) where.entity = entity;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  if (!logs) return errorResponse("Erreur lors de la récupération des logs");

  return successResponse({
    logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

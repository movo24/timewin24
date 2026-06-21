import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/decimal";
import {
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

// GET /api/analytics/employees
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { storeIds, error: storeError } = await getAccessibleStoreIds();
    if (storeError) return storeError;

    const { searchParams } = new URL(req.url);
    const dateFromStr = searchParams.get("dateFrom");
    const dateToStr = searchParams.get("dateTo");
    const storeIdParam = searchParams.get("storeId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const sortBy = searchParams.get("sortBy") || "overallScore";

    if (!dateFromStr || !dateToStr) {
      return errorResponse("dateFrom et dateTo sont requis");
    }

    const dateFrom = new Date(dateFromStr);
    const dateTo = new Date(dateToStr);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return errorResponse("Format de date invalide");
    }

    // Validate sortBy
    const validSortFields = [
      "overallScore",
      "salesScore",
      "productivityScore",
      "upsellScore",
      "disciplineScore",
      "inventoryScore",
      "rank",
    ];
    if (!validSortFields.includes(sortBy)) {
      return errorResponse(
        `sortBy invalide. Valeurs acceptées : ${validSortFields.join(", ")}`
      );
    }

    // Build store filter
    const storeFilter: Record<string, unknown> = {};
    if (storeIdParam) {
      if (storeIds && !storeIds.includes(storeIdParam)) {
        return errorResponse("Accès refusé à ce magasin", 403);
      }
      storeFilter.storeId = storeIdParam;
    } else if (storeIds) {
      storeFilter.storeId = { in: storeIds };
    }

    const where = {
      periodStart: { lte: dateTo },
      periodEnd: { gte: dateFrom },
      ...storeFilter,
    };

    const [total, scores] = await Promise.all([
      prisma.employeePerformanceScore.count({ where }),
      prisma.employeePerformanceScore.findMany({
        where,
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              employeeCode: true,
              stores: {
                select: {
                  store: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { [sortBy]: sortBy === "rank" ? "asc" : "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Enrichir avec les ventes totales de la période
    const employeeIds = scores.map((s) => s.employeeId);
    const salesAgg = await prisma.employeePerformanceDaily.groupBy({
      by: ["employeeId", "storeId"],
      where: {
        employeeId: { in: employeeIds },
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      _sum: {
        totalSales: true,
        transactions: true,
        workingHours: true,
      },
    });

    const salesMap = new Map<string, { totalSales: number; transactions: number; salesPerHour: number }>();
    for (const s of salesAgg) {
      const totalSales = toNum(s._sum.totalSales ?? 0);
      const hours = s._sum.workingHours || 0;
      salesMap.set(`${s.employeeId}:${s.storeId}`, {
        totalSales: Math.round(totalSales * 100) / 100,
        transactions: s._sum.transactions || 0,
        salesPerHour: hours > 0 ? Math.round((totalSales / hours) * 100) / 100 : 0,
      });
    }

    const employees = scores.map((s) => {
      const storeInfo = s.employee.stores.find((st) => st.store.id === s.storeId);
      const sales = salesMap.get(`${s.employeeId}:${s.storeId}`);

      return {
        employeeId: s.employeeId,
        employeeName: `${s.employee.firstName} ${s.employee.lastName}`,
        employeeCode: s.employee.employeeCode,
        storeId: s.storeId,
        storeName: storeInfo?.store.name || "",
        overallScore: s.overallScore,
        salesScore: s.salesScore,
        productivityScore: s.productivityScore,
        upsellScore: s.upsellScore,
        disciplineScore: s.disciplineScore,
        inventoryScore: s.inventoryScore,
        rank: s.rank,
        badge: s.badge,
        totalSales: sales?.totalSales || 0,
        salesPerHour: sales?.salesPerHour || 0,
        transactions: sales?.transactions || 0,
      };
    });

    return successResponse({
      employees,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error("[analytics/employees] Error:", err);
    return errorResponse("Erreur interne du serveur", 500);
  }
}

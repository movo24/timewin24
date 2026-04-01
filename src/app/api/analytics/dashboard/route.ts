import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

// GET /api/analytics/dashboard
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

    if (!dateFromStr || !dateToStr) {
      return errorResponse("dateFrom et dateTo sont requis");
    }

    const dateFrom = new Date(dateFromStr);
    const dateTo = new Date(dateToStr);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return errorResponse("Format de date invalide");
    }

    // Build store filter
    const storeFilter: Record<string, unknown> = {};
    if (storeIdParam) {
      // Vérifier que le store est accessible
      if (storeIds && !storeIds.includes(storeIdParam)) {
        return errorResponse("Accès refusé à ce magasin", 403);
      }
      storeFilter.storeId = storeIdParam;
    } else if (storeIds) {
      storeFilter.storeId = { in: storeIds };
    }

    // 1. KPIs agrégés depuis PosSalesData (source de vérité pour CA + paiements)
    const salesAgg = await prisma.posSalesData.aggregate({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      _sum: {
        revenue: true,
        transactions: true,
        itemsSold: true,
        cardAmount: true,
        cashAmount: true,
        otherAmount: true,
      },
    });

    // Heures travaillées depuis EmployeePerformanceDaily
    const hoursAgg = await prisma.employeePerformanceDaily.aggregate({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      _sum: { workingHours: true },
    });

    // Nombre d'employés distincts
    const employeeCountResult = await prisma.employeePerformanceDaily.findMany({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });

    const totalSales = salesAgg._sum.revenue || 0;
    const totalTransactions = salesAgg._sum.transactions || 0;
    const totalHours = hoursAgg._sum.workingHours || 0;

    const avgBasket = totalTransactions > 0 ? totalSales / totalTransactions : 0;

    const kpis = {
      totalRevenue: Math.round(totalSales * 100) / 100,
      totalTransactions,
      avgBasket: Math.round(avgBasket * 100) / 100,
      revenuePerHour:
        totalHours > 0
          ? Math.round((totalSales / totalHours) * 100) / 100
          : 0,
      cashAmount: Math.round((salesAgg._sum.cashAmount || 0) * 100) / 100,
      cardAmount: Math.round((salesAgg._sum.cardAmount || 0) * 100) / 100,
      otherAmount: Math.round((salesAgg._sum.otherAmount || 0) * 100) / 100,
      employeeCount: employeeCountResult.length,
      totalHours: Math.round(totalHours * 100) / 100,
    };

    // 2. Tendance journalière (depuis PosSalesData pour cohérence avec CA total)
    const dailyTrendRaw = await prisma.posSalesData.groupBy({
      by: ["date"],
      where: {
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      _sum: {
        revenue: true,
        transactions: true,
      },
      orderBy: { date: "asc" },
    });

    const dailyTrend = dailyTrendRaw.map((d) => ({
      date: d.date,
      revenue: Math.round((d._sum.revenue || 0) * 100) / 100,
      transactions: d._sum.transactions || 0,
    }));

    // 3. Distribution horaire (depuis PosSalesData)
    const hourlyRaw = await prisma.posSalesData.groupBy({
      by: ["hourSlot"],
      where: {
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      _sum: {
        revenue: true,
        transactions: true,
      },
      orderBy: { hourSlot: "asc" },
    });

    const hourlyDistribution = hourlyRaw.map((h) => ({
      hour: h.hourSlot,
      revenue: Math.round((h._sum.revenue || 0) * 100) / 100,
      transactions: h._sum.transactions || 0,
    }));

    // 4. Top employés (top 5 par score)
    const topEmployees = await prisma.employeePerformanceScore.findMany({
      where: {
        periodStart: { lte: dateTo },
        periodEnd: { gte: dateFrom },
        ...storeFilter,
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeCode: true },
        },
      },
      orderBy: { overallScore: "desc" },
      take: 5,
    });

    return successResponse({
      kpis,
      dailyTrend,
      hourlyDistribution,
      topEmployees: topEmployees.map((e) => ({
        employeeId: e.employeeId,
        employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
        employeeCode: e.employee.employeeCode,
        overallScore: e.overallScore,
        badge: e.badge,
        rank: e.rank,
      })),
    });
  } catch (err) {
    console.error("[analytics/dashboard] Error:", err);
    return errorResponse("Erreur interne du serveur", 500);
  }
}

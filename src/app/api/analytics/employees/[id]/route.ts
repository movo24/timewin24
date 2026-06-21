import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/decimal";
import {
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

// GET /api/analytics/employees/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { storeIds, error: storeError } = await getAccessibleStoreIds();
    if (storeError) return storeError;

    const { id: employeeId } = await params;
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

    // Vérifier que l'employé existe — enrichi avec identité complète
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        email: true,
        contractType: true,
        posRole: true,
        active: true,
        stores: {
          select: {
            store: {
              select: {
                id: true,
                name: true,
                storeCode: true,
                city: true,
              },
            },
          },
        },
      },
    });

    if (!employee) {
      return errorResponse("Employé non trouvé", 404);
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

    // 1. Score de performance (période courante)
    const score = await prisma.employeePerformanceScore.findFirst({
      where: {
        employeeId,
        periodStart: { lte: dateTo },
        periodEnd: { gte: dateFrom },
        ...storeFilter,
      },
      orderBy: { calculatedAt: "desc" },
    });

    // Score période précédente (pour tendance)
    const periodLengthMs = dateTo.getTime() - dateFrom.getTime();
    const previousFrom = new Date(dateFrom.getTime() - periodLengthMs);
    const previousTo = new Date(dateFrom.getTime() - 1);

    const previousScore = await prisma.employeePerformanceScore.findFirst({
      where: {
        employeeId,
        periodStart: { lte: previousTo },
        periodEnd: { gte: previousFrom },
        ...storeFilter,
      },
      orderBy: { calculatedAt: "desc" },
    });

    // 2. Tendance journalière
    const dailyTrendRaw = await prisma.employeePerformanceDaily.findMany({
      where: {
        employeeId,
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        storeId: true,
        totalSales: true,
        transactions: true,
        itemsSold: true,
        avgBasket: true,
        workingHours: true,
        salesPerHour: true,
        upsellRate: true,
        cashAmount: true,
        cardAmount: true,
      },
    });

    const dailyTrend = dailyTrendRaw.map((d) => ({
      ...d,
      totalSales: toNum(d.totalSales),
      avgBasket: toNum(d.avgBasket),
      salesPerHour: toNum(d.salesPerHour),
      cashAmount: toNum(d.cashAmount),
      cardAmount: toNum(d.cardAmount),
    })); // M101b: Decimal -> number

    // 3. Pattern horaire
    const hourlyRaw = await prisma.employeePerformanceHourly.groupBy({
      by: ["hour"],
      where: {
        employeeId,
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      _sum: {
        sales: true,
        transactions: true,
      },
      _count: true,
      orderBy: { hour: "asc" },
    });

    const hourlyPattern = hourlyRaw.map((h) => ({
      hour: h.hour,
      avgSales:
        h._count > 0
          ? Math.round((toNum(h._sum.sales ?? 0) / h._count) * 100) / 100
          : 0,
      totalSales: Math.round(toNum(h._sum.sales ?? 0) * 100) / 100,
      totalTransactions: h._sum.transactions || 0,
      days: h._count,
    }));

    // 4. Statistiques de présence (PosTimeClock)
    const timeClocks = await prisma.posTimeClock.findMany({
      where: {
        employeeId,
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      select: {
        date: true,
        clockIn: true,
        clockOut: true,
        workedHours: true,
        deltaMinutes: true,
        status: true,
      },
      orderBy: { date: "asc" },
    });

    const onTimeCount = timeClocks.filter(
      (tc) => tc.status === "on_time" || tc.status === "early"
    ).length;
    const lateCount = timeClocks.filter((tc) => tc.status === "late").length;
    const noShowCount = timeClocks.filter((tc) => tc.status === "no_show").length;
    const totalWorkedHours = timeClocks.reduce(
      (sum, tc) => sum + (tc.workedHours || 0),
      0
    );

    const attendanceStats = {
      total: timeClocks.length,
      onTime: onTimeCount,
      early: timeClocks.filter((tc) => tc.status === "early").length,
      late: lateCount,
      noShow: noShowCount,
      totalWorkedHours: Math.round(totalWorkedHours * 100) / 100,
      avgDeltaMinutes:
        timeClocks.length > 0
          ? Math.round(
              timeClocks.reduce(
                (sum, tc) => sum + (tc.deltaMinutes || 0),
                0
              ) / timeClocks.length
            )
          : 0,
      records: timeClocks,
    };

    // 5. Inventory participation
    const inventorySessionCount = await prisma.inventorySession.count({
      where: {
        employeeId,
        startedAt: { gte: dateFrom, lte: dateTo },
        ...(storeIdParam ? { storeId: storeIdParam } : {}),
      },
    });

    const inventoryCountAgg = await prisma.inventoryCount.aggregate({
      where: {
        session: {
          employeeId,
          startedAt: { gte: dateFrom, lte: dateTo },
          ...(storeIdParam ? { storeId: storeIdParam } : {}),
        },
      },
      _count: true,
    });

    // 6. Payment breakdown pour cet employé
    const paymentAgg = await prisma.employeePerformanceDaily.aggregate({
      where: {
        employeeId,
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      _sum: {
        cashAmount: true,
        cardAmount: true,
        totalSales: true,
        workingHours: true,
      },
    });

    const empTotalSales = toNum(paymentAgg._sum.totalSales ?? 0);
    const empTotalHours = paymentAgg._sum.workingHours || 0;
    const empSalesPerHour =
      empTotalHours > 0
        ? Math.round((empTotalSales / empTotalHours) * 100) / 100
        : 0;

    // 7. Store average for comparison
    const storeAvgAgg = await prisma.employeePerformanceDaily.aggregate({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        ...storeFilter,
      },
      _sum: {
        totalSales: true,
        workingHours: true,
      },
    });

    const storeDistinctEmployees =
      await prisma.employeePerformanceDaily.findMany({
        where: {
          date: { gte: dateFrom, lte: dateTo },
          ...storeFilter,
        },
        select: { employeeId: true },
        distinct: ["employeeId"],
      });

    const storeEmpCount = storeDistinctEmployees.length;
    const storeTotalSales = toNum(storeAvgAgg._sum.totalSales ?? 0);
    const storeTotalHours = storeAvgAgg._sum.workingHours || 0;
    const storeAvgSalesPerHour =
      storeTotalHours > 0 && storeEmpCount > 0
        ? Math.round(
            (storeTotalSales / storeTotalHours) * 100
          ) / 100
        : 0;

    // Build primary store assignment
    const primaryStore = employee.stores[0]?.store || null;

    // Build profile object
    const profile = {
      identity: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        employeeCode: employee.employeeCode,
        email: employee.email,
        active: employee.active,
        contractType: employee.contractType,
      },
      store: primaryStore
        ? {
            id: primaryStore.id,
            name: primaryStore.name,
            storeCode: primaryStore.storeCode,
            city: primaryStore.city,
          }
        : null,
      role: employee.posRole || null,
      hoursWorked: Math.round(totalWorkedHours * 100) / 100,
      attendance: {
        lateCount,
        onTimeCount,
        noShowCount,
      },
      inventory: {
        sessionCount: inventorySessionCount,
        itemsCounted: inventoryCountAgg._count || 0,
      },
      paymentBreakdown: {
        cardAmount: Math.round(toNum(paymentAgg._sum.cardAmount ?? 0) * 100) / 100,
        cashAmount: Math.round(toNum(paymentAgg._sum.cashAmount ?? 0) * 100) / 100,
        totalSales: Math.round(empTotalSales * 100) / 100,
      },
      comparison: {
        employeeSalesPerHour: empSalesPerHour,
        storeAvgSalesPerHour,
        ratio:
          storeAvgSalesPerHour > 0
            ? Math.round((empSalesPerHour / storeAvgSalesPerHour) * 100) / 100
            : null,
      },
      scoreTrend: {
        current: score?.overallScore ?? null,
        previous: previousScore?.overallScore ?? null,
        delta:
          score && previousScore
            ? Math.round(
                (score.overallScore - previousScore.overallScore) * 100
              ) / 100
            : null,
      },
    };

    return successResponse({
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        code: employee.employeeCode,
      },
      profile,
      score: score
        ? {
            overallScore: score.overallScore,
            salesScore: score.salesScore,
            productivityScore: score.productivityScore,
            upsellScore: score.upsellScore,
            disciplineScore: score.disciplineScore,
            inventoryScore: score.inventoryScore,
            rank: score.rank,
            badge: score.badge,
            breakdown: score.breakdown,
          }
        : null,
      dailyTrend,
      hourlyPattern,
      attendance: attendanceStats,
    });
  } catch (err) {
    console.error("[analytics/employees/[id]] Error:", err);
    return errorResponse("Erreur interne du serveur", 500);
  }
}

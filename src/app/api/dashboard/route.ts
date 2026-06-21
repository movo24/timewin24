import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

// GET /api/dashboard
// Retourne tous les KPIs opérationnels du jour pour le dashboard global
export async function GET(_req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { storeIds, error: storeError } = await getAccessibleStoreIds();
    if (storeError) return storeError;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const today = new Date(todayStr);
    const todayEnd = new Date(todayStr + "T23:59:59.999Z");

    // Filtre magasin selon le rôle (null = admin = tous)
    const storeWhere = storeIds ? { storeId: { in: storeIds } } : {};
    const storeWhereStore = storeIds ? { id: { in: storeIds } } : {};

    // ── 1. Magasins actifs / total ──────────────────────────────────
    const [totalStores, activeStores] = await Promise.all([
      prisma.store.count({ where: storeWhereStore }),
      prisma.store.count({ where: { ...storeWhereStore, status: "ACTIVE" } }),
    ]);

    // ── 2. Employés actifs / total ──────────────────────────────────
    const [totalEmployees, activeEmployees] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { active: true } }),
    ]);

    // ── 3. Shifts aujourd'hui ──────────────────────────────────────
    const shiftsToday = await prisma.shift.findMany({
      where: {
        date: today,
        ...storeWhere,
      },
      select: {
        id: true,
        employeeId: true,
        startTime: true,
        endTime: true,
        storeId: true,
      },
    });

    const totalShiftsToday = shiftsToday.length;
    const coveredShifts = shiftsToday.filter((s) => s.employeeId !== null).length;
    const uncoveredShifts = totalShiftsToday - coveredShifts;

    // ── 4. Pointages du jour ────────────────────────────────────────
    const clockInsToday = await prisma.clockIn.count({
      where: {
        clockInAt: { gte: today, lte: todayEnd },
        ...storeWhere,
      },
    });

    const attendanceRate =
      coveredShifts > 0 ? Math.round((clockInsToday / coveredShifts) * 100) : 0;

    // ── 5. Absences aujourd'hui ─────────────────────────────────────
    const absencesToday = await prisma.absenceDeclaration.count({
      where: {
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });

    // ── 6. Alertes non traitées (top 5) ────────────────────────────
    const openAlerts = await prisma.managerAlert.findMany({
      where: {
        resolvedAt: null,
        ...storeWhere,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        type: true,
        title: true,
        severity: true,
        createdAt: true,
        storeId: true,
        store: { select: { name: true } },
      },
    });

    const totalOpenAlerts = await prisma.managerAlert.count({
      where: { resolvedAt: null, ...storeWhere },
    });

    // ── 7. Santé du planning cette semaine ─────────────────────────
    const weekStart = new Date(today);
    const dayOfWeek = weekStart.getDay(); // 0=Dim
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart.setDate(weekStart.getDate() + diffToMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const shiftsThisWeek = await prisma.shift.count({
      where: {
        date: { gte: weekStart, lte: weekEnd },
        ...storeWhere,
      },
    });

    const uncoveredThisWeek = await prisma.shift.count({
      where: {
        date: { gte: weekStart, lte: weekEnd },
        employeeId: null,
        ...storeWhere,
      },
    });

    const planningCoverageRate =
      shiftsThisWeek > 0
        ? Math.round(((shiftsThisWeek - uncoveredThisWeek) / shiftsThisWeek) * 100)
        : 100;

    // ── 8. Anomalies IA non résolues ────────────────────────────────
    let openAnomalies = 0;
    try {
      openAnomalies = await prisma.aiAnomaly.count({
        where: { resolvedAt: null } as any,
      });
    } catch {
      // Table peut ne pas exister en dev
    }

    // ── 9. Performance récente (7 derniers jours) ───────────────────
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    let recentPerf: { _avg: { salesPerHour: number | null }; _sum: { workingHours: number | null } } = {
      _avg: { salesPerHour: null },
      _sum: { workingHours: null },
    };
    try {
      recentPerf = await prisma.employeePerformanceDaily.aggregate({
        where: {
          date: { gte: sevenDaysAgo, lte: today },
          ...(storeIds ? { storeId: { in: storeIds } } : {}),
        },
        _avg: { salesPerHour: true },
        _sum: { workingHours: true },
      });
    } catch {
      // Table vide ou non encore alimentée
    }

    // ── 10. Top magasins cette semaine (par shifts couverts) ────────
    const storeList = await prisma.store.findMany({
      where: { ...storeWhereStore, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        city: true,
        storeCode: true,
        _count: {
          select: {
            shifts: true,
            employees: true,
          },
        },
      },
      orderBy: { name: "asc" },
      take: 10,
    });

    return successResponse({
      // Magasins
      stores: {
        total: totalStores,
        active: activeStores,
        inactive: totalStores - activeStores,
      },
      // Employés
      employees: {
        total: totalEmployees,
        active: activeEmployees,
        inactive: totalEmployees - activeEmployees,
      },
      // Shifts du jour
      today: {
        date: todayStr,
        shiftsTotal: totalShiftsToday,
        shiftsCovered: coveredShifts,
        shiftsUncovered: uncoveredShifts,
        clockIns: clockInsToday,
        attendanceRate,
        absences: absencesToday,
      },
      // Semaine en cours
      week: {
        start: weekStart.toISOString().slice(0, 10),
        end: weekEnd.toISOString().slice(0, 10),
        shiftsTotal: shiftsThisWeek,
        shiftsUncovered: uncoveredThisWeek,
        coverageRate: planningCoverageRate,
      },
      // Alertes
      alerts: {
        total: totalOpenAlerts,
        topAlerts: openAlerts.map((a) => ({
          id: a.id,
          type: a.type,
          message: a.title,
          severity: a.severity,
          createdAt: a.createdAt,
          storeId: a.storeId,
          store: a.store,
        })),
      },
      // Anomalies IA
      anomalies: {
        open: openAnomalies,
      },
      // Performance récente
      performance: {
        avgScore: recentPerf._avg.salesPerHour != null
          ? Math.round((recentPerf._avg.salesPerHour || 0) * 10) / 10
          : null,
        totalHours: recentPerf._sum.workingHours != null
          ? Math.round((recentPerf._sum.workingHours || 0) * 10) / 10
          : null,
      },
      // Liste magasins pour les cards
      storeCards: storeList.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        storeCode: s.storeCode,
        employeeCount: s._count.employees,
      })),
    });
  } catch (err) {
    console.error("[dashboard] Error:", err);
    return errorResponse("Erreur interne du serveur", 500);
  }
}

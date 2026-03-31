/**
 * Analytics Engine — Alerts Detector
 *
 * Detecte les alertes de performance en comparant les
 * metriques individuelles aux moyennes du magasin.
 */

import { prisma } from "@/lib/prisma";
import type { PerformanceAlert } from "./types";

/**
 * Detecte les alertes de performance pour la periode donnee.
 *
 * Regles :
 *  1. CA < 50% de la moyenne magasin → critical (low_revenue)
 *  2. Panier moyen < 70% de la moyenne → warning (low_basket)
 *  3. Taux upsell < 1.2 → warning (no_upsell)
 *  4. cashAmount/totalSales > 70% → warning (cash_anomaly)
 *  5. Score drop > 30% vs periode precedente → critical (performance_drop)
 */
export async function detectAlerts(
  dateFrom: Date,
  dateTo: Date,
  storeId?: string
): Promise<PerformanceAlert[]> {
  const alerts: PerformanceAlert[] = [];

  const storeFilter = storeId ? { storeId } : {};

  // 1. Recuperer les donnees journalieres de la periode
  const dailyData = await prisma.employeePerformanceDaily.findMany({
    where: {
      date: { gte: dateFrom, lte: dateTo },
      ...storeFilter,
    },
    include: {
      employee: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  if (dailyData.length === 0) return alerts;

  // 2. Agreger par employe+magasin
  const empMap = new Map<
    string,
    {
      employeeId: string;
      employeeName: string;
      storeId: string;
      totalSales: number;
      totalTransactions: number;
      totalItemsSold: number;
      totalHours: number;
      cashAmount: number;
      days: number;
      avgBasketSum: number;
    }
  >();

  for (const d of dailyData) {
    const key = `${d.employeeId}:${d.storeId}`;
    if (!empMap.has(key)) {
      empMap.set(key, {
        employeeId: d.employeeId,
        employeeName: `${d.employee.firstName} ${d.employee.lastName}`,
        storeId: d.storeId,
        totalSales: 0,
        totalTransactions: 0,
        totalItemsSold: 0,
        totalHours: 0,
        cashAmount: 0,
        days: 0,
        avgBasketSum: 0,
      });
    }
    const emp = empMap.get(key)!;
    emp.totalSales += d.totalSales;
    emp.totalTransactions += d.transactions;
    emp.totalItemsSold += d.itemsSold;
    emp.totalHours += d.workingHours;
    emp.cashAmount += d.cashAmount;
    emp.days++;
    emp.avgBasketSum += d.avgBasket;
  }

  // 3. Calculer les moyennes par magasin
  const storeAvgs = new Map<
    string,
    { avgSalesPerHour: number; avgBasket: number; empCount: number }
  >();

  for (const [, emp] of empMap) {
    if (!storeAvgs.has(emp.storeId)) {
      storeAvgs.set(emp.storeId, {
        avgSalesPerHour: 0,
        avgBasket: 0,
        empCount: 0,
      });
    }
    const sa = storeAvgs.get(emp.storeId)!;
    const salesPerHour = emp.totalHours > 0 ? emp.totalSales / emp.totalHours : 0;
    const avgBasket = emp.days > 0 ? emp.avgBasketSum / emp.days : 0;
    sa.avgSalesPerHour += salesPerHour;
    sa.avgBasket += avgBasket;
    sa.empCount++;
  }

  for (const [, sa] of storeAvgs) {
    if (sa.empCount > 0) {
      sa.avgSalesPerHour /= sa.empCount;
      sa.avgBasket /= sa.empCount;
    }
  }

  // 4. Verifier les regles pour chaque employe
  for (const [, emp] of empMap) {
    const avg = storeAvgs.get(emp.storeId);
    if (!avg || avg.empCount === 0) continue;

    const empSalesPerHour =
      emp.totalHours > 0 ? emp.totalSales / emp.totalHours : 0;
    const empAvgBasket = emp.days > 0 ? emp.avgBasketSum / emp.days : 0;
    const empUpsellRate =
      emp.totalTransactions > 0
        ? emp.totalItemsSold / emp.totalTransactions
        : 0;

    // Regle 1 : CA < 50% de la moyenne → critical
    if (avg.avgSalesPerHour > 0 && empSalesPerHour < avg.avgSalesPerHour * 0.5) {
      alerts.push({
        type: "low_revenue",
        severity: "critical",
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        storeId: emp.storeId,
        message: `CA/heure (${empSalesPerHour.toFixed(2)} \u20ac) inferieur a 50% de la moyenne magasin (${avg.avgSalesPerHour.toFixed(2)} \u20ac)`,
        value: Math.round(empSalesPerHour * 100) / 100,
        threshold: Math.round(avg.avgSalesPerHour * 0.5 * 100) / 100,
      });
    }

    // Regle 2 : Panier moyen < 70% de la moyenne → warning
    if (avg.avgBasket > 0 && empAvgBasket < avg.avgBasket * 0.7) {
      alerts.push({
        type: "low_basket",
        severity: "warning",
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        storeId: emp.storeId,
        message: `Panier moyen (${empAvgBasket.toFixed(2)} \u20ac) inferieur a 70% de la moyenne (${avg.avgBasket.toFixed(2)} \u20ac)`,
        value: Math.round(empAvgBasket * 100) / 100,
        threshold: Math.round(avg.avgBasket * 0.7 * 100) / 100,
      });
    }

    // Regle 3 : Taux upsell < 1.2 → warning
    if (empUpsellRate < 1.2 && emp.totalTransactions > 0) {
      alerts.push({
        type: "no_upsell",
        severity: "warning",
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        storeId: emp.storeId,
        message: `Taux d'upsell faible (${empUpsellRate.toFixed(2)} articles/transaction, seuil: 1.2)`,
        value: Math.round(empUpsellRate * 100) / 100,
        threshold: 1.2,
      });
    }

    // Regle 4 : cashAmount/totalSales > 70% → warning
    if (emp.totalSales > 0 && emp.cashAmount / emp.totalSales > 0.7) {
      const cashRatio = emp.cashAmount / emp.totalSales;
      alerts.push({
        type: "cash_anomaly",
        severity: "warning",
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        storeId: emp.storeId,
        message: `Part especes elevee (${(cashRatio * 100).toFixed(1)}%, seuil: 70%)`,
        value: Math.round(cashRatio * 100) / 100,
        threshold: 0.7,
      });
    }
  }

  // 5. Regle 5 : Drop de score > 30% vs periode precedente
  const periodLengthMs = dateTo.getTime() - dateFrom.getTime();
  const previousFrom = new Date(dateFrom.getTime() - periodLengthMs);
  const previousTo = new Date(dateFrom.getTime() - 1); // Jour avant dateFrom

  const currentScores = await prisma.employeePerformanceScore.findMany({
    where: {
      periodStart: dateFrom,
      ...storeFilter,
    },
    include: {
      employee: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  const previousScores = await prisma.employeePerformanceScore.findMany({
    where: {
      periodStart: previousFrom,
      ...storeFilter,
    },
  });

  const prevScoreMap = new Map<string, number>();
  for (const ps of previousScores) {
    prevScoreMap.set(`${ps.employeeId}:${ps.storeId}`, ps.overallScore);
  }

  for (const cs of currentScores) {
    const prevScore = prevScoreMap.get(`${cs.employeeId}:${cs.storeId}`);
    if (prevScore && prevScore > 0) {
      const dropPct = ((prevScore - cs.overallScore) / prevScore) * 100;
      if (dropPct > 30) {
        alerts.push({
          type: "performance_drop",
          severity: "critical",
          employeeId: cs.employeeId,
          employeeName: `${cs.employee.firstName} ${cs.employee.lastName}`,
          storeId: cs.storeId,
          message: `Chute de score de ${dropPct.toFixed(1)}% (${prevScore.toFixed(1)} → ${cs.overallScore.toFixed(1)})`,
          value: Math.round(cs.overallScore * 100) / 100,
          threshold: Math.round(prevScore * 0.7 * 100) / 100,
        });
      }
    }
  }

  return alerts;
}

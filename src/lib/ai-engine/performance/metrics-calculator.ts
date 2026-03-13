/**
 * AI Engine — Employee Performance Metrics Calculator
 *
 * Calcule 5 scores IA par employé:
 * - Performance (CA/h vs moyenne magasin)
 * - Upsell (capacité de vente additionnelle)
 * - Risk (risque de problème/départ)
 * - Regularity (régularité horaire)
 * - FraudRisk (risque de fraude au pointage)
 */

import { prisma } from "@/lib/prisma";
import {
  correlateEmployeeSales,
  getStoreSalesAverages,
} from "./pos-correlator";
import type {
  EmployeePerformanceMetrics,
  PerformanceBreakdown,
} from "../types";

// ─── Types ───────────────────────────────────────

interface CalculationPeriod {
  start: Date;
  end: Date;
}

// ─── Calculator ──────────────────────────────────

/**
 * Calcule les métriques IA pour tous les employés actifs
 */
export async function calculateAllMetrics(
  period: CalculationPeriod
): Promise<EmployeePerformanceMetrics[]> {
  // 1. Corrélation ventes POS ↔ employés
  const salesCorrelations = await correlateEmployeeSales(
    period.start,
    period.end
  );
  const storeAverages = await getStoreSalesAverages(period.start, period.end);
  const storeAvgMap = new Map(storeAverages.map((s) => [s.storeId, s]));

  // 2. Données de pointage POS
  const timeClocks = await prisma.posTimeClock.findMany({
    where: {
      date: { gte: period.start, lte: period.end },
    },
    select: {
      employeeId: true,
      storeId: true,
      date: true,
      clockIn: true,
      clockOut: true,
      deltaMinutes: true,
      status: true,
    },
  });

  // Index par employé
  const clocksByEmployee = new Map<string, typeof timeClocks>();
  for (const tc of timeClocks) {
    if (!clocksByEmployee.has(tc.employeeId)) {
      clocksByEmployee.set(tc.employeeId, []);
    }
    clocksByEmployee.get(tc.employeeId)!.push(tc);
  }

  // 3. Charger les shifts de la période
  const shifts = await prisma.shift.findMany({
    where: {
      date: { gte: period.start, lte: period.end },
      employeeId: { not: null },
    },
    select: {
      employeeId: true,
      storeId: true,
      date: true,
      startTime: true,
      endTime: true,
    },
  });

  const shiftsByEmployee = new Map<string, typeof shifts>();
  for (const s of shifts) {
    if (!s.employeeId) continue;
    if (!shiftsByEmployee.has(s.employeeId)) {
      shiftsByEmployee.set(s.employeeId, []);
    }
    shiftsByEmployee.get(s.employeeId)!.push(s);
  }

  // 4. Charger les employés avec scores fiabilité
  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: {
      id: true,
      reliabilityScore: true,
      weeklyHours: true,
    },
  });

  // Sales correlation index by employeeId
  const salesByEmployee = new Map<string, (typeof salesCorrelations)[0]>();
  for (const sc of salesCorrelations) {
    // Aggregate if employee has multiple stores
    if (salesByEmployee.has(sc.employeeId)) {
      const existing = salesByEmployee.get(sc.employeeId)!;
      existing.totalRevenue += sc.totalRevenue;
      existing.totalTransactions += sc.totalTransactions;
      existing.totalHours += sc.totalHours;
      existing.shiftCount += sc.shiftCount;
      existing.revenuePerHour =
        existing.totalHours > 0
          ? existing.totalRevenue / existing.totalHours
          : 0;
      existing.transactionsPerHour =
        existing.totalHours > 0
          ? existing.totalTransactions / existing.totalHours
          : 0;
    } else {
      salesByEmployee.set(sc.employeeId, { ...sc });
    }
  }

  // 5. Calculer les métriques par employé
  const results: EmployeePerformanceMetrics[] = [];

  for (const employee of employees) {
    const sales = salesByEmployee.get(employee.id);
    const clocks = clocksByEmployee.get(employee.id) || [];
    const empShifts = shiftsByEmployee.get(employee.id) || [];

    const breakdown = calculateBreakdown(
      sales,
      clocks,
      empShifts,
      storeAvgMap
    );

    const performanceScore = calculatePerformanceScore(breakdown);
    const upsellScore = calculateUpsellScore(breakdown);
    const riskScore = calculateRiskScore(
      breakdown,
      employee.reliabilityScore,
      clocks
    );
    const regularityScore = calculateRegularityScore(empShifts);
    const fraudRiskScore = calculateFraudRiskScore(clocks, empShifts);

    results.push({
      employeeId: employee.id,
      performanceScore,
      upsellScore,
      riskScore,
      regularityScore,
      fraudRiskScore,
      breakdown,
      calculatedAt: new Date(),
    });
  }

  return results;
}

/**
 * Persiste les métriques calculées en DB
 */
export async function persistMetrics(
  metrics: EmployeePerformanceMetrics[],
  period: CalculationPeriod
): Promise<number> {
  let count = 0;

  for (const m of metrics) {
    await prisma.employeeAiMetrics.upsert({
      where: { employeeId: m.employeeId },
      create: {
        employeeId: m.employeeId,
        performanceScore: m.performanceScore,
        upsellScore: m.upsellScore,
        riskScore: m.riskScore,
        regularityScore: m.regularityScore,
        fraudRiskScore: m.fraudRiskScore,
        breakdown: JSON.parse(JSON.stringify(m.breakdown)),
        periodStart: period.start,
        periodEnd: period.end,
        calculatedAt: m.calculatedAt,
      },
      update: {
        performanceScore: m.performanceScore,
        upsellScore: m.upsellScore,
        riskScore: m.riskScore,
        regularityScore: m.regularityScore,
        fraudRiskScore: m.fraudRiskScore,
        breakdown: JSON.parse(JSON.stringify(m.breakdown)),
        periodStart: period.start,
        periodEnd: period.end,
        calculatedAt: m.calculatedAt,
      },
    });
    count++;
  }

  return count;
}

// ─── Score Calculators ───────────────────────────

function calculateBreakdown(
  sales: {
    storeId: string;
    revenuePerHour: number;
    transactionsPerHour: number;
    totalHours: number;
    shiftCount: number;
  } | undefined,
  clocks: { status: string | null; deltaMinutes: number | null }[],
  empShifts: { startTime: string; endTime: string }[],
  storeAvgMap: Map<string, { avgRevenuePerHour: number; avgTransactionsPerHour: number }>
): PerformanceBreakdown {
  const revenuePerHour = sales?.revenuePerHour ?? 0;
  const transactionsPerHour = sales?.transactionsPerHour ?? 0;
  const totalHours = sales?.totalHours ?? 0;
  const totalShifts = sales?.shiftCount ?? empShifts.length;

  // Trouver la moyenne du magasin principal
  const storeAvg = sales ? storeAvgMap.get(sales.storeId) : undefined;
  const revenueVsAverage =
    storeAvg && storeAvg.avgRevenuePerHour > 0
      ? ((revenuePerHour - storeAvg.avgRevenuePerHour) /
          storeAvg.avgRevenuePerHour) *
        100
      : 0;

  // Ponctualité
  const totalClocks = clocks.length;
  const onTimeClocks = clocks.filter(
    (c) => c.status === "on_time" || c.status === "early"
  ).length;
  const punctualityRate =
    totalClocks > 0
      ? Math.round((onTimeClocks / totalClocks) * 100)
      : 100;

  // Présence
  const noShows = clocks.filter((c) => c.status === "no_show").length;
  const attendanceRate =
    totalShifts > 0
      ? Math.round(((totalShifts - noShows) / totalShifts) * 100)
      : 100;

  return {
    revenuePerHour: Math.round(revenuePerHour * 100) / 100,
    revenueVsAverage: Math.round(revenueVsAverage * 100) / 100,
    transactionsPerHour: Math.round(transactionsPerHour * 100) / 100,
    punctualityRate,
    attendanceRate,
    totalHours: Math.round(totalHours * 100) / 100,
    totalShifts,
  };
}

function calculatePerformanceScore(breakdown: PerformanceBreakdown): number {
  // Pondérations: CA 40%, ponctualité 30%, présence 30%
  let score = 50; // Base

  // Bonus/malus CA vs moyenne
  if (breakdown.revenueVsAverage > 20) score += 25;
  else if (breakdown.revenueVsAverage > 10) score += 15;
  else if (breakdown.revenueVsAverage > 0) score += 5;
  else if (breakdown.revenueVsAverage < -20) score -= 20;
  else if (breakdown.revenueVsAverage < -10) score -= 10;

  // Ponctualité
  if (breakdown.punctualityRate >= 95) score += 15;
  else if (breakdown.punctualityRate >= 85) score += 8;
  else if (breakdown.punctualityRate < 70) score -= 15;

  // Présence
  if (breakdown.attendanceRate >= 98) score += 10;
  else if (breakdown.attendanceRate >= 90) score += 5;
  else if (breakdown.attendanceRate < 80) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function calculateUpsellScore(breakdown: PerformanceBreakdown): number {
  // Basé sur les transactions par heure vs la moyenne
  let score = 50;

  if (breakdown.transactionsPerHour > 0) {
    // Ratio articles/transaction (estimation)
    if (breakdown.revenueVsAverage > 15) score += 25;
    else if (breakdown.revenueVsAverage > 5) score += 10;
    else if (breakdown.revenueVsAverage < -10) score -= 15;
  }

  if (breakdown.totalShifts < 3) {
    score = 50; // Pas assez de données
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function calculateRiskScore(
  breakdown: PerformanceBreakdown,
  reliabilityScore: number | null,
  clocks: { deltaMinutes: number | null }[]
): number {
  // Score de risque élevé = employé à surveiller
  let risk = 20; // Base faible

  // Ponctualité faible = risque
  if (breakdown.punctualityRate < 70) risk += 30;
  else if (breakdown.punctualityRate < 85) risk += 15;

  // Présence faible = risque
  if (breakdown.attendanceRate < 80) risk += 25;
  else if (breakdown.attendanceRate < 90) risk += 10;

  // Retards fréquents (> 15 min)
  const bigLates = clocks.filter(
    (c) => c.deltaMinutes !== null && c.deltaMinutes < -15
  ).length;
  if (bigLates >= 3) risk += 15;
  else if (bigLates >= 1) risk += 5;

  // Score de fiabilité existant
  if (reliabilityScore !== null) {
    if (reliabilityScore < 40) risk += 15;
    else if (reliabilityScore < 60) risk += 5;
    else if (reliabilityScore > 85) risk -= 10;
  }

  return Math.max(0, Math.min(100, Math.round(risk)));
}

function calculateRegularityScore(
  empShifts: { startTime: string; endTime: string }[]
): number {
  if (empShifts.length < 3) return 50; // Pas assez de données

  // Calculer l'écart-type des heures de début
  const startMinutes = empShifts.map((s) => {
    const [h, m] = s.startTime.split(":").map(Number);
    return h * 60 + m;
  });

  const avgStart =
    startMinutes.reduce((sum, m) => sum + m, 0) / startMinutes.length;
  const variance =
    startMinutes.reduce((sum, m) => sum + Math.pow(m - avgStart, 2), 0) /
    startMinutes.length;
  const stdDev = Math.sqrt(variance);

  // Score: plus c'est régulier, plus le score est haut
  // stdDev < 30 min → excellent, > 120 min → faible
  if (stdDev < 30) return 95;
  if (stdDev < 60) return 80;
  if (stdDev < 90) return 60;
  if (stdDev < 120) return 40;
  return 25;
}

function calculateFraudRiskScore(
  clocks: { status: string | null; deltaMinutes: number | null }[],
  empShifts: { date: unknown; startTime: string; endTime: string }[]
): number {
  if (clocks.length === 0) return 0;

  let risk = 0;

  // 1. Pointages très en avance (> 30 min avant le shift) = suspect
  const veryEarly = clocks.filter(
    (c) => c.deltaMinutes !== null && c.deltaMinutes > 30
  ).length;
  if (veryEarly >= 3) risk += 30;
  else if (veryEarly >= 1) risk += 10;

  // 2. Pas de pointage malgré des shifts planifiés
  const noShows = clocks.filter((c) => c.status === "no_show").length;
  const totalShifts = empShifts.length;
  if (totalShifts > 0) {
    const noShowRate = noShows / totalShifts;
    if (noShowRate > 0.2) risk += 25;
    else if (noShowRate > 0.1) risk += 10;
  }

  // 3. Patterns de pointage identiques (même minute exacte = suspect)
  const clockInMinutes = clocks
    .map((c) => {
      // deltaMinutes is available but we check patterns in arrival times
      return c.deltaMinutes;
    })
    .filter((d): d is number => d !== null);

  if (clockInMinutes.length >= 5) {
    const identical = clockInMinutes.filter(
      (d) => d === clockInMinutes[0]
    ).length;
    if (identical / clockInMinutes.length > 0.8) {
      risk += 20; // Trop identique = suspect
    }
  }

  return Math.max(0, Math.min(100, Math.round(risk)));
}

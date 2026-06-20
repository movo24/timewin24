// ─── POS Analysis Data Collector ──────────────────
// Collecte les données réelles du POS pour alimenter l'analyse IA
// Données brutes → contexte structuré pour le prompt Gemini

import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/decimal";

export interface PosAnalysisData {
  store: {
    id: string;
    name: string;
    city: string | null;
    currency: string;
  };
  period: {
    from: string;
    to: string;
    days: number;
  };
  revenue: {
    total: number;
    transactions: number;
    itemsSold: number;
    avgBasket: number;
    dailyAvg: number;
    byDay: { date: string; revenue: number; transactions: number; avgBasket: number }[];
    byHour: { hour: number; revenue: number; transactions: number }[];
  };
  costs: {
    hasData: boolean;
    totalEmployeeCost: number;
    employeeCount: number;
    scheduledHours: number;
  };
  staffing: {
    employeesCount: number;
    shiftsCount: number;
    avgShiftsPerDay: number;
  };
  topProducts: {
    available: boolean;
    // Produits depuis les données POS agrégées (si détail disponible via events)
  };
  trends: {
    revenueGrowth: number | null; // % vs période précédente
    transactionGrowth: number | null;
    basketTrend: number | null;
  };
  alerts: {
    count: number;
    recent: { type: string; title: string; date: string }[];
  };
}

/**
 * Collecte toutes les données POS d'un magasin pour une période
 */
export async function collectPosData(
  storeId: string,
  dateFrom: string,
  dateTo: string
): Promise<PosAnalysisData> {
  const from = new Date(dateFrom + "T00:00:00Z");
  const to = new Date(dateTo + "T23:59:59Z");
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));

  // Fetch store info
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, city: true, currency: true },
  });

  if (!store) throw new Error("Magasin introuvable");

  // Fetch sales data
  const salesData = await prisma.posSalesData.findMany({
    where: {
      storeId,
      date: { gte: from, lte: to },
    },
    orderBy: [{ date: "asc" }, { hourSlot: "asc" }],
  });

  // Aggregate by day
  const byDayMap = new Map<string, { revenue: number; transactions: number; items: number }>();
  const byHourMap = new Map<number, { revenue: number; transactions: number }>();

  let totalRevenue = 0;
  let totalTransactions = 0;
  let totalItems = 0;

  for (const row of salesData) {
    const dateStr = row.date.toISOString().split("T")[0];
    totalRevenue += row.revenue;
    totalTransactions += row.transactions;
    totalItems += row.itemsSold;

    // By day
    const dayEntry = byDayMap.get(dateStr) || { revenue: 0, transactions: 0, items: 0 };
    dayEntry.revenue += row.revenue;
    dayEntry.transactions += row.transactions;
    dayEntry.items += row.itemsSold;
    byDayMap.set(dateStr, dayEntry);

    // By hour
    const hourEntry = byHourMap.get(row.hourSlot) || { revenue: 0, transactions: 0 };
    hourEntry.revenue += row.revenue;
    hourEntry.transactions += row.transactions;
    byHourMap.set(row.hourSlot, hourEntry);
  }

  const byDay = Array.from(byDayMap.entries()).map(([date, d]) => ({
    date,
    revenue: Math.round(d.revenue * 100) / 100,
    transactions: d.transactions,
    avgBasket: d.transactions > 0 ? Math.round((d.revenue / d.transactions) * 100) / 100 : 0,
  }));

  const byHour = Array.from(byHourMap.entries())
    .map(([hour, d]) => ({
      hour,
      revenue: Math.round(d.revenue * 100) / 100,
      transactions: d.transactions,
    }))
    .sort((a, b) => a.hour - b.hour);

  // Staffing data
  const shiftsCount = await prisma.shift.count({
    where: { storeId, date: { gte: from, lte: to } },
  });

  const employeesCount = await prisma.storeEmployee.count({
    where: { storeId },
  });

  // Employee costs (if configured)
  const employees = await prisma.storeEmployee.findMany({
    where: { storeId },
    select: {
      employee: {
        select: {
          costConfig: {
            select: { hourlyRateGross: true },
          },
          weeklyHours: true,
        },
      },
    },
  });

  let totalEmployeeCost = 0;
  let scheduledHours = 0;
  for (const se of employees) {
    const rate = toNum(se.employee.costConfig?.hourlyRateGross ?? 0);
    const weeklyH = se.employee.weeklyHours || 35;
    const monthlyH = (weeklyH * days) / 7;
    scheduledHours += monthlyH;
    totalEmployeeCost += rate * monthlyH * 1.45; // brut + ~45% charges
  }

  // Previous period for trends
  const prevDays = days;
  const prevFrom = new Date(from);
  prevFrom.setDate(prevFrom.getDate() - prevDays);
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);

  const prevSales = await prisma.posSalesData.aggregate({
    where: {
      storeId,
      date: { gte: prevFrom, lte: prevTo },
    },
    _sum: { revenue: true, transactions: true },
  });

  const prevRevenue = prevSales._sum.revenue || 0;
  const prevTransactions = prevSales._sum.transactions || 0;
  const prevAvgBasket = prevTransactions > 0 ? prevRevenue / prevTransactions : 0;
  const currentAvgBasket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // Recent alerts
  const recentAlerts = await prisma.managerAlert.findMany({
    where: { storeId, date: { gte: from, lte: to } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { type: true, title: true, date: true },
  });

  return {
    store: {
      id: store.id,
      name: store.name,
      city: store.city,
      currency: store.currency || "EUR",
    },
    period: { from: dateFrom, to: dateTo, days },
    revenue: {
      total: Math.round(totalRevenue * 100) / 100,
      transactions: totalTransactions,
      itemsSold: totalItems,
      avgBasket: Math.round(currentAvgBasket * 100) / 100,
      dailyAvg: Math.round((totalRevenue / days) * 100) / 100,
      byDay,
      byHour,
    },
    costs: {
      hasData: totalEmployeeCost > 0,
      totalEmployeeCost: Math.round(totalEmployeeCost),
      employeeCount: employees.length,
      scheduledHours: Math.round(scheduledHours),
    },
    staffing: {
      employeesCount,
      shiftsCount,
      avgShiftsPerDay: Math.round((shiftsCount / days) * 10) / 10,
    },
    topProducts: { available: false },
    trends: {
      revenueGrowth: prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10 : null,
      transactionGrowth: prevTransactions > 0 ? Math.round(((totalTransactions - prevTransactions) / prevTransactions) * 1000) / 10 : null,
      basketTrend: prevAvgBasket > 0 ? Math.round(((currentAvgBasket - prevAvgBasket) / prevAvgBasket) * 1000) / 10 : null,
    },
    alerts: {
      count: recentAlerts.length,
      recent: recentAlerts.map((a) => ({
        type: a.type,
        title: a.title,
        date: a.date.toISOString().split("T")[0],
      })),
    },
  };
}

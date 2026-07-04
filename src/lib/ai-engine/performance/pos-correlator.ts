/**
 * AI Engine — POS Correlator
 *
 * Corrèle les données de vente POS avec les shifts pour attribuer
 * le chiffre d'affaires à chaque employé.
 */

import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/decimal";

// ─── Types ───────────────────────────────────────

export interface EmployeeSalesCorrelation {
  employeeId: string;
  storeId: string;
  /** Chiffre d'affaires total attribué */
  totalRevenue: number;
  /** Nombre total de transactions */
  totalTransactions: number;
  /** Nombre total d'articles vendus */
  totalItemsSold: number;
  /** Heures travaillées dans la période */
  totalHours: number;
  /** CA par heure */
  revenuePerHour: number;
  /** Transactions par heure */
  transactionsPerHour: number;
  /** Nombre de shifts */
  shiftCount: number;
}

export interface StoreSalesAverage {
  storeId: string;
  avgRevenuePerHour: number;
  avgTransactionsPerHour: number;
  totalRevenue: number;
  totalHours: number;
}

// ─── Correlator ──────────────────────────────────

/**
 * Corrèle les ventes POS avec les shifts pour une période donnée.
 * Attribution proportionnelle: si 2 employés travaillent pendant un créneau,
 * le CA est divisé par le nombre d'employés présents.
 */
export async function correlateEmployeeSales(
  periodStart: Date,
  periodEnd: Date,
  storeId?: string
): Promise<EmployeeSalesCorrelation[]> {
  // 1. Charger les shifts de la période
  const shifts = await prisma.shift.findMany({
    where: {
      date: { gte: periodStart, lte: periodEnd },
      employeeId: { not: null },
      ...(storeId ? { storeId } : {}),
    },
    select: {
      id: true,
      employeeId: true,
      storeId: true,
      date: true,
      startTime: true,
      endTime: true,
    },
  });

  // 2. Charger les données POS de la période
  const salesData = await prisma.posSalesData.findMany({
    where: {
      date: { gte: periodStart, lte: periodEnd },
      ...(storeId ? { storeId } : {}),
    },
    select: {
      storeId: true,
      date: true,
      hourSlot: true,
      revenue: true,
      transactions: true,
      itemsSold: true,
    },
  });

  // 3. Index des ventes par storeId + date + hourSlot
  const salesIndex = new Map<string, typeof salesData[0]>();
  for (const sale of salesData) {
    const dateStr = (sale.date as Date).toISOString().split("T")[0];
    const key = `${sale.storeId}:${dateStr}:${sale.hourSlot}`;
    salesIndex.set(key, sale);
  }

  // 4. Calculer les heures couvertes par chaque shift et attribuer le CA
  const employeeMap = new Map<string, {
    totalRevenue: number;
    totalTransactions: number;
    totalItemsSold: number;
    totalHours: number;
    shiftCount: number;
    storeId: string;
  }>();

  // Index: combien d'employés travaillent par storeId + date + hourSlot
  const coverageIndex = new Map<string, number>();
  for (const shift of shifts) {
    const dateStr = (shift.date as Date).toISOString().split("T")[0];
    const startHour = parseInt(shift.startTime.split(":")[0], 10);
    const endHour = parseInt(shift.endTime.split(":")[0], 10);

    for (let h = startHour; h < endHour; h++) {
      const key = `${shift.storeId}:${dateStr}:${h}`;
      coverageIndex.set(key, (coverageIndex.get(key) || 0) + 1);
    }
  }

  // Attribution du CA
  for (const shift of shifts) {
    if (!shift.employeeId) continue;

    const empKey = `${shift.employeeId}:${shift.storeId}`;
    if (!employeeMap.has(empKey)) {
      employeeMap.set(empKey, {
        totalRevenue: 0,
        totalTransactions: 0,
        totalItemsSold: 0,
        totalHours: 0,
        shiftCount: 0,
        storeId: shift.storeId,
      });
    }

    const emp = employeeMap.get(empKey)!;
    emp.shiftCount++;

    const dateStr = (shift.date as Date).toISOString().split("T")[0];
    const startHour = parseInt(shift.startTime.split(":")[0], 10);
    const endHour = parseInt(shift.endTime.split(":")[0], 10);

    // Calculer les heures (incluant minutes)
    const [sh, sm] = shift.startTime.split(":").map(Number);
    const [eh, em] = shift.endTime.split(":").map(Number);
    emp.totalHours += (eh * 60 + em - sh * 60 - sm) / 60;

    // Attribuer le CA proportionnellement
    for (let h = startHour; h < endHour; h++) {
      const salesKey = `${shift.storeId}:${dateStr}:${h}`;
      const sale = salesIndex.get(salesKey);
      if (sale) {
        const coverageKey = `${shift.storeId}:${dateStr}:${h}`;
        const numEmployees = coverageIndex.get(coverageKey) || 1;
        emp.totalRevenue += toNum(sale.revenue) / numEmployees;
        emp.totalTransactions += sale.transactions / numEmployees;
        emp.totalItemsSold += sale.itemsSold / numEmployees;
      }
    }
  }

  // 5. Construire le résultat
  const results: EmployeeSalesCorrelation[] = [];
  for (const [key, data] of employeeMap) {
    const employeeId = key.split(":")[0];
    results.push({
      employeeId,
      storeId: data.storeId,
      totalRevenue: Math.round(data.totalRevenue * 100) / 100,
      totalTransactions: Math.round(data.totalTransactions),
      totalItemsSold: Math.round(data.totalItemsSold),
      totalHours: Math.round(data.totalHours * 100) / 100,
      revenuePerHour:
        data.totalHours > 0
          ? Math.round((data.totalRevenue / data.totalHours) * 100) / 100
          : 0,
      transactionsPerHour:
        data.totalHours > 0
          ? Math.round((data.totalTransactions / data.totalHours) * 100) / 100
          : 0,
      shiftCount: data.shiftCount,
    });
  }

  return results;
}

/**
 * Calcule la moyenne des ventes par magasin pour la période
 */
export async function getStoreSalesAverages(
  periodStart: Date,
  periodEnd: Date
): Promise<StoreSalesAverage[]> {
  const correlations = await correlateEmployeeSales(periodStart, periodEnd);

  const storeMap = new Map<string, {
    totalRevenue: number;
    totalHours: number;
    totalTransactions: number;
  }>();

  for (const c of correlations) {
    if (!storeMap.has(c.storeId)) {
      storeMap.set(c.storeId, {
        totalRevenue: 0,
        totalHours: 0,
        totalTransactions: 0,
      });
    }
    const store = storeMap.get(c.storeId)!;
    store.totalRevenue += c.totalRevenue;
    store.totalHours += c.totalHours;
    store.totalTransactions += c.totalTransactions;
  }

  const results: StoreSalesAverage[] = [];
  for (const [storeId, data] of storeMap) {
    results.push({
      storeId,
      avgRevenuePerHour:
        data.totalHours > 0
          ? Math.round((data.totalRevenue / data.totalHours) * 100) / 100
          : 0,
      avgTransactionsPerHour:
        data.totalHours > 0
          ? Math.round((data.totalTransactions / data.totalHours) * 100) / 100
          : 0,
      totalRevenue: Math.round(data.totalRevenue * 100) / 100,
      totalHours: Math.round(data.totalHours * 100) / 100,
    });
  }

  return results;
}

/**
 * Analytics Engine — Performance Aggregator
 *
 * Moteur de calcul principal : agrège les données POS + shifts
 * pour calculer les performances journalières, horaires et les scores.
 *
 * Réutilise la logique d'attribution proportionnelle de pos-correlator.ts
 */

import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/decimal";

// ─── Helpers ────────────────────────────────────────

/**
 * Normalise un ratio par rapport à la moyenne du magasin.
 * ratio >= 1 → 50 + (ratio-1)*50, clamped to 100
 * ratio <  1 → ratio * 50
 */
function normalize(ratio: number): number {
  if (ratio >= 1) {
    return Math.min(50 + (ratio - 1) * 50, 100);
  }
  return ratio * 50;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Aggregate Performance Data ─────────────────────

/**
 * Agrège les données POS et shifts pour calculer les performances
 * journalières et horaires de chaque employé.
 *
 * Attribution proportionnelle : si plusieurs employés couvrent
 * le même créneau horaire, le CA est divisé entre eux.
 */
export async function aggregatePerformanceData(
  dateFrom: Date,
  dateTo: Date,
  storeId?: string
): Promise<number> {
  // 1. Charger les shifts de la période (avec employé assigné)
  const shifts = await prisma.shift.findMany({
    where: {
      date: { gte: dateFrom, lte: dateTo },
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

  if (shifts.length === 0) return 0;

  // 2. Charger les données POS de la période
  const salesData = await prisma.posSalesData.findMany({
    where: {
      date: { gte: dateFrom, lte: dateTo },
      ...(storeId ? { storeId } : {}),
    },
    select: {
      storeId: true,
      date: true,
      hourSlot: true,
      revenue: true,
      transactions: true,
      itemsSold: true,
      cardAmount: true,
      cashAmount: true,
    },
  });

  // 3. Index des ventes par storeId + date + hourSlot
  const salesIndex = new Map<string, (typeof salesData)[0]>();
  for (const sale of salesData) {
    const dateStr = (sale.date as Date).toISOString().split("T")[0];
    const key = `${sale.storeId}:${dateStr}:${sale.hourSlot}`;
    salesIndex.set(key, sale);
  }

  // 4. Calculer la couverture (nombre d'employés par créneau)
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

  // 5. Calculer les données par employé + magasin + date
  // Clé : employeeId:storeId:date
  const dailyMap = new Map<
    string,
    {
      employeeId: string;
      storeId: string;
      date: Date;
      totalSales: number;
      transactions: number;
      itemsSold: number;
      workingHours: number;
      cashAmount: number;
      cardAmount: number;
    }
  >();

  // Pour le détail horaire
  const hourlyMap = new Map<
    string,
    {
      employeeId: string;
      storeId: string;
      date: Date;
      hour: number;
      sales: number;
      transactions: number;
    }
  >();

  for (const shift of shifts) {
    if (!shift.employeeId) continue;

    const dateStr = (shift.date as Date).toISOString().split("T")[0];
    const dailyKey = `${shift.employeeId}:${shift.storeId}:${dateStr}`;

    if (!dailyMap.has(dailyKey)) {
      dailyMap.set(dailyKey, {
        employeeId: shift.employeeId,
        storeId: shift.storeId,
        date: shift.date,
        totalSales: 0,
        transactions: 0,
        itemsSold: 0,
        workingHours: 0,
        cashAmount: 0,
        cardAmount: 0,
      });
    }

    const daily = dailyMap.get(dailyKey)!;

    // Heures travaillées
    const [sh, sm] = shift.startTime.split(":").map(Number);
    const [eh, em] = shift.endTime.split(":").map(Number);
    daily.workingHours += (eh * 60 + em - sh * 60 - sm) / 60;

    // Attribution proportionnelle du CA
    const startHour = parseInt(shift.startTime.split(":")[0], 10);
    const endHour = parseInt(shift.endTime.split(":")[0], 10);

    for (let h = startHour; h < endHour; h++) {
      const salesKey = `${shift.storeId}:${dateStr}:${h}`;
      const sale = salesIndex.get(salesKey);

      if (sale) {
        const numEmployees = coverageIndex.get(salesKey) || 1;
        const revShare = toNum(sale.revenue) / numEmployees;
        const txShare = sale.transactions / numEmployees;
        const itemsShare = sale.itemsSold / numEmployees;
        const cardShare = toNum(sale.cardAmount) / numEmployees;
        const cashShare = toNum(sale.cashAmount) / numEmployees;

        daily.totalSales += revShare;
        daily.transactions += txShare;
        daily.itemsSold += itemsShare;
        daily.cardAmount += cardShare;
        daily.cashAmount += cashShare;

        // Enregistrement horaire
        const hourlyKey = `${shift.employeeId}:${shift.storeId}:${dateStr}:${h}`;
        if (!hourlyMap.has(hourlyKey)) {
          hourlyMap.set(hourlyKey, {
            employeeId: shift.employeeId,
            storeId: shift.storeId,
            date: shift.date,
            hour: h,
            sales: 0,
            transactions: 0,
          });
        }
        const hourly = hourlyMap.get(hourlyKey)!;
        hourly.sales += revShare;
        hourly.transactions += txShare;
      }
    }
  }

  // 6. Upsert EmployeePerformanceDaily
  let upsertCount = 0;

  for (const [, data] of dailyMap) {
    const avgBasket =
      data.transactions > 0 ? round2(data.totalSales / data.transactions) : 0;
    const salesPerHour =
      data.workingHours > 0 ? round2(data.totalSales / data.workingHours) : 0;
    const upsellRate =
      data.transactions > 0
        ? round2(data.itemsSold / data.transactions)
        : 0;

    await prisma.employeePerformanceDaily.upsert({
      where: {
        employeeId_storeId_date: {
          employeeId: data.employeeId,
          storeId: data.storeId,
          date: data.date,
        },
      },
      update: {
        totalSales: round2(data.totalSales),
        transactions: Math.round(data.transactions),
        itemsSold: Math.round(data.itemsSold),
        avgBasket,
        cashAmount: round2(data.cashAmount),
        cardAmount: round2(data.cardAmount),
        workingHours: round2(data.workingHours),
        salesPerHour,
        upsellRate,
      },
      create: {
        employeeId: data.employeeId,
        storeId: data.storeId,
        date: data.date,
        totalSales: round2(data.totalSales),
        transactions: Math.round(data.transactions),
        itemsSold: Math.round(data.itemsSold),
        avgBasket,
        cashAmount: round2(data.cashAmount),
        cardAmount: round2(data.cardAmount),
        workingHours: round2(data.workingHours),
        salesPerHour,
        upsellRate,
      },
    });
    upsertCount++;
  }

  // 7. Upsert EmployeePerformanceHourly
  for (const [, data] of hourlyMap) {
    await prisma.employeePerformanceHourly.upsert({
      where: {
        employeeId_storeId_date_hour: {
          employeeId: data.employeeId,
          storeId: data.storeId,
          date: data.date,
          hour: data.hour,
        },
      },
      update: {
        sales: round2(data.sales),
        transactions: Math.round(data.transactions),
      },
      create: {
        employeeId: data.employeeId,
        storeId: data.storeId,
        date: data.date,
        hour: data.hour,
        sales: round2(data.sales),
        transactions: Math.round(data.transactions),
      },
    });
  }

  return upsertCount;
}

// ─── Calculate Performance Scores ───────────────────

/**
 * Calcule les scores de performance pour chaque employé
 * sur la période donnée, par rapport à la moyenne du magasin.
 */
export async function calculatePerformanceScores(
  dateFrom: Date,
  dateTo: Date,
  storeId?: string
): Promise<number> {
  // 1. Récupérer les données journalières agrégées
  const dailyData = await prisma.employeePerformanceDaily.findMany({
    where: {
      date: { gte: dateFrom, lte: dateTo },
      ...(storeId ? { storeId } : {}),
    },
  });

  if (dailyData.length === 0) return 0;

  // 2. Calculer les moyennes par magasin
  const storeAggregates = new Map<
    string,
    {
      totalSalesPerHour: number;
      totalTransPerHour: number;
      totalUpsellRate: number;
      count: number;
    }
  >();

  // Agréger par employé+magasin d'abord
  const empStoreMap = new Map<
    string,
    {
      employeeId: string;
      storeId: string;
      totalSales: number;
      totalTransactions: number;
      totalItemsSold: number;
      totalHours: number;
    }
  >();

  for (const d of dailyData) {
    const key = `${d.employeeId}:${d.storeId}`;
    if (!empStoreMap.has(key)) {
      empStoreMap.set(key, {
        employeeId: d.employeeId,
        storeId: d.storeId,
        totalSales: 0,
        totalTransactions: 0,
        totalItemsSold: 0,
        totalHours: 0,
      });
    }
    const emp = empStoreMap.get(key)!;
    emp.totalSales += toNum(d.totalSales);
    emp.totalTransactions += d.transactions;
    emp.totalItemsSold += d.itemsSold;
    emp.totalHours += d.workingHours;
  }

  // Calculer salesPerHour, transPerHour, upsellRate par employé
  const empMetrics = new Map<
    string,
    {
      employeeId: string;
      storeId: string;
      salesPerHour: number;
      transPerHour: number;
      upsellRate: number;
    }
  >();

  for (const [key, emp] of empStoreMap) {
    const salesPerHour = emp.totalHours > 0 ? emp.totalSales / emp.totalHours : 0;
    const transPerHour =
      emp.totalHours > 0 ? emp.totalTransactions / emp.totalHours : 0;
    const upsellRate =
      emp.totalTransactions > 0
        ? emp.totalItemsSold / emp.totalTransactions
        : 0;

    empMetrics.set(key, {
      employeeId: emp.employeeId,
      storeId: emp.storeId,
      salesPerHour,
      transPerHour,
      upsellRate,
    });

    // Accumuler pour moyenne magasin
    if (!storeAggregates.has(emp.storeId)) {
      storeAggregates.set(emp.storeId, {
        totalSalesPerHour: 0,
        totalTransPerHour: 0,
        totalUpsellRate: 0,
        count: 0,
      });
    }
    const sa = storeAggregates.get(emp.storeId)!;
    sa.totalSalesPerHour += salesPerHour;
    sa.totalTransPerHour += transPerHour;
    sa.totalUpsellRate += upsellRate;
    sa.count++;
  }

  // Moyennes par magasin
  const storeAvgs = new Map<
    string,
    { avgSalesPerHour: number; avgTransPerHour: number; avgUpsellRate: number }
  >();
  for (const [sid, sa] of storeAggregates) {
    storeAvgs.set(sid, {
      avgSalesPerHour: sa.count > 0 ? sa.totalSalesPerHour / sa.count : 0,
      avgTransPerHour: sa.count > 0 ? sa.totalTransPerHour / sa.count : 0,
      avgUpsellRate: sa.count > 0 ? sa.totalUpsellRate / sa.count : 0,
    });
  }

  // 3. Calculer discipline score depuis PosTimeClock
  const timeClocks = await prisma.posTimeClock.findMany({
    where: {
      date: { gte: dateFrom, lte: dateTo },
      ...(storeId ? { storeId } : {}),
      status: { not: null },
    },
    select: {
      employeeId: true,
      storeId: true,
      status: true,
    },
  });

  const disciplineMap = new Map<string, { onTime: number; total: number }>();
  for (const tc of timeClocks) {
    const key = `${tc.employeeId}:${tc.storeId}`;
    if (!disciplineMap.has(key)) {
      disciplineMap.set(key, { onTime: 0, total: 0 });
    }
    const d = disciplineMap.get(key)!;
    d.total++;
    if (tc.status === "on_time" || tc.status === "early") {
      d.onTime++;
    }
  }

  // 4. Calculer inventory score depuis InventorySession
  const inventorySessions = await prisma.inventorySession.groupBy({
    by: ["employeeId"],
    where: {
      startedAt: { gte: dateFrom, lte: dateTo },
      ...(storeId ? { storeId } : {}),
    },
    _count: { id: true },
  });

  const inventoryMap = new Map<string, number>();
  for (const inv of inventorySessions) {
    inventoryMap.set(inv.employeeId, inv._count.id);
  }

  // 5. Calculer les scores et ranker par magasin
  const scores: Array<{
    employeeId: string;
    storeId: string;
    overallScore: number;
    salesScore: number;
    productivityScore: number;
    upsellScore: number;
    disciplineScore: number;
    inventoryScore: number;
    badge: "EXCELLENT" | "BON" | "MOYEN" | "FAIBLE";
  }> = [];

  for (const [, metrics] of empMetrics) {
    const avg = storeAvgs.get(metrics.storeId);
    if (!avg) continue;

    // Sales score (40%)
    const salesRatio =
      avg.avgSalesPerHour > 0 ? metrics.salesPerHour / avg.avgSalesPerHour : 1;
    const salesScore = clamp(normalize(salesRatio), 0, 100);

    // Productivity score (25%)
    const prodRatio =
      avg.avgTransPerHour > 0 ? metrics.transPerHour / avg.avgTransPerHour : 1;
    const productivityScore = clamp(normalize(prodRatio), 0, 100);

    // Upsell score (15%)
    const upsellRatio =
      avg.avgUpsellRate > 0 ? metrics.upsellRate / avg.avgUpsellRate : 1;
    const upsellScore = clamp(normalize(upsellRatio), 0, 100);

    // Discipline score (10%)
    const discKey = `${metrics.employeeId}:${metrics.storeId}`;
    const disc = disciplineMap.get(discKey);
    const disciplineScore = disc && disc.total > 0
      ? clamp((disc.onTime / disc.total) * 100, 0, 100)
      : 50; // Défaut si pas de données pointage

    // Inventory score (10%)
    const invCount = inventoryMap.get(metrics.employeeId) || 0;
    const inventoryScore = invCount > 0 ? Math.min(invCount * 25, 100) : 50; // Défaut 50

    // Overall (weighted sum)
    const overallScore = round2(
      salesScore * 0.4 +
        productivityScore * 0.25 +
        upsellScore * 0.15 +
        disciplineScore * 0.1 +
        inventoryScore * 0.1
    );

    // Badge
    let badge: "EXCELLENT" | "BON" | "MOYEN" | "FAIBLE";
    if (overallScore >= 80) badge = "EXCELLENT";
    else if (overallScore >= 60) badge = "BON";
    else if (overallScore >= 40) badge = "MOYEN";
    else badge = "FAIBLE";

    scores.push({
      employeeId: metrics.employeeId,
      storeId: metrics.storeId,
      overallScore,
      salesScore: round2(salesScore),
      productivityScore: round2(productivityScore),
      upsellScore: round2(upsellScore),
      disciplineScore: round2(disciplineScore),
      inventoryScore: round2(inventoryScore),
      badge,
    });
  }

  // 6. Rank par magasin (par overallScore décroissant)
  const storeGroups = new Map<string, typeof scores>();
  for (const s of scores) {
    if (!storeGroups.has(s.storeId)) storeGroups.set(s.storeId, []);
    storeGroups.get(s.storeId)!.push(s);
  }

  const rankedScores: Array<(typeof scores)[0] & { rank: number }> = [];
  for (const [, group] of storeGroups) {
    group.sort((a, b) => b.overallScore - a.overallScore);
    group.forEach((s, i) => {
      rankedScores.push({ ...s, rank: i + 1 });
    });
  }

  // 7. Upsert EmployeePerformanceScore
  let upsertCount = 0;
  for (const s of rankedScores) {
    await prisma.employeePerformanceScore.upsert({
      where: {
        employeeId_storeId_periodStart: {
          employeeId: s.employeeId,
          storeId: s.storeId,
          periodStart: dateFrom,
        },
      },
      update: {
        periodEnd: dateTo,
        overallScore: s.overallScore,
        salesScore: s.salesScore,
        productivityScore: s.productivityScore,
        upsellScore: s.upsellScore,
        disciplineScore: s.disciplineScore,
        inventoryScore: s.inventoryScore,
        rank: s.rank,
        badge: s.badge,
        breakdown: {
          weights: {
            sales: 0.4,
            productivity: 0.25,
            upsell: 0.15,
            discipline: 0.1,
            inventory: 0.1,
          },
        },
        calculatedAt: new Date(),
      },
      create: {
        employeeId: s.employeeId,
        storeId: s.storeId,
        periodStart: dateFrom,
        periodEnd: dateTo,
        overallScore: s.overallScore,
        salesScore: s.salesScore,
        productivityScore: s.productivityScore,
        upsellScore: s.upsellScore,
        disciplineScore: s.disciplineScore,
        inventoryScore: s.inventoryScore,
        rank: s.rank,
        badge: s.badge,
        breakdown: {
          weights: {
            sales: 0.4,
            productivity: 0.25,
            upsell: 0.15,
            discipline: 0.1,
            inventory: 0.1,
          },
        },
      },
    });
    upsertCount++;
  }

  return upsertCount;
}

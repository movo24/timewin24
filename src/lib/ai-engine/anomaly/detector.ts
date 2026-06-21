/**
 * AI Engine — Anomaly Detector
 *
 * Détection statistique d'anomalies via z-scores.
 * Aucun appel LLM — 100% SQL + calcul local.
 */

import { prisma } from "@/lib/prisma";
import { AI_CONFIG } from "../config";
import type { DetectedAnomaly, AnomalySeverity } from "../types";

// ─── Types ───────────────────────────────────────

interface DetectionOptions {
  storeId?: string;
  daysBack?: number;
}

// ─── Main Detector ───────────────────────────────

/**
 * Lance un scan complet de détection d'anomalies
 */
export async function detectAnomalies(
  options?: DetectionOptions
): Promise<DetectedAnomaly[]> {
  const daysBack = options?.daysBack ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const anomalies: DetectedAnomaly[] = [];

  // Exécuter les 6 détecteurs en parallèle
  const [
    clockAnomalies,
    revenueAnomalies,
    ghostShifts,
    patternBreaks,
    overtimeAbuses,
    locationMismatches,
  ] = await Promise.all([
    detectClockDiscrepancies(since, options?.storeId),
    detectRevenueDrop(since, options?.storeId),
    detectGhostShifts(since, options?.storeId),
    detectPatternBreaks(since, options?.storeId),
    detectOvertimeAbuse(since, options?.storeId),
    detectLocationMismatch(since, options?.storeId),
  ]);

  anomalies.push(
    ...clockAnomalies,
    ...revenueAnomalies,
    ...ghostShifts,
    ...patternBreaks,
    ...overtimeAbuses,
    ...locationMismatches
  );

  return anomalies;
}

// ─── Detector 1: Clock Discrepancies ─────────────

async function detectClockDiscrepancies(
  since: Date,
  storeId?: string
): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  // Trouver les pointages avec un gros écart vs shift planifié
  const timeClocks = await prisma.posTimeClock.findMany({
    where: {
      date: { gte: since },
      deltaMinutes: { not: null },
      ...(storeId ? { storeId } : {}),
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

  // Grouper par employé et calculer z-scores
  const byEmployee = new Map<string, number[]>();
  for (const tc of timeClocks) {
    if (tc.deltaMinutes === null) continue;
    if (!byEmployee.has(tc.employeeId)) {
      byEmployee.set(tc.employeeId, []);
    }
    byEmployee.get(tc.employeeId)!.push(tc.deltaMinutes);
  }

  for (const tc of timeClocks) {
    if (tc.deltaMinutes === null) continue;
    const deltas = byEmployee.get(tc.employeeId) || [];
    if (deltas.length < 3) continue;

    // FIX C1: Use raw values for z-score (not Math.abs) to preserve direction
    // Then check absolute z-score against threshold to detect outliers in both directions
    const zScore = calculateZScore(tc.deltaMinutes, deltas);

    if (Math.abs(zScore) >= AI_CONFIG.anomaly.zScoreThreshold) {
      const direction = tc.deltaMinutes > 0 ? "en avance" : "en retard";
      anomalies.push({
        type: "CLOCK_DISCREPANCY",
        severity: getSeverity(Math.abs(zScore)),
        employeeId: tc.employeeId,
        storeId: tc.storeId,
        date: tc.date as Date,
        description: `Écart de pointage anormal: ${Math.abs(tc.deltaMinutes)} min ${direction} (z-score: ${Math.abs(zScore).toFixed(1)})`,
        evidence: {
          observed: tc.deltaMinutes,
          expected: mean(deltas),
          deviation: Math.abs(zScore),
          rawData: {
            clockIn: tc.clockIn,
            clockOut: tc.clockOut,
            deltaMinutes: tc.deltaMinutes,
          },
        },
      });
    }
  }

  return anomalies;
}

// ─── Detector 2: Revenue Drop ────────────────────

async function detectRevenueDrop(
  since: Date,
  storeId?: string
): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  // Récupérer le CA quotidien par magasin
  const salesData = await prisma.posSalesData.findMany({
    where: {
      date: { gte: since },
      ...(storeId ? { storeId } : {}),
    },
    select: {
      storeId: true,
      date: true,
      revenue: true,
    },
  });

  // Grouper par magasin et par jour
  const dailyByStore = new Map<string, { date: Date; revenue: number }[]>();
  const dateRevMap = new Map<string, number>();

  for (const sale of salesData) {
    const dateStr = (sale.date as Date).toISOString().split("T")[0];
    const key = `${sale.storeId}:${dateStr}`;
    dateRevMap.set(key, (dateRevMap.get(key) || 0) + sale.revenue);
  }

  for (const [key, revenue] of dateRevMap) {
    const [sid, dateStr] = key.split(":");
    if (!dailyByStore.has(sid)) dailyByStore.set(sid, []);
    dailyByStore.get(sid)!.push({ date: new Date(dateStr), revenue });
  }

  // Z-score sur le CA quotidien par magasin
  for (const [sid, dailyRevenues] of dailyByStore) {
    if (dailyRevenues.length < 7) continue;

    const revenues = dailyRevenues.map((d) => d.revenue);

    for (const day of dailyRevenues) {
      const zScore = calculateZScore(day.revenue, revenues);
      // On cherche les baisses (z-score négatif)
      if (zScore <= -AI_CONFIG.anomaly.zScoreThreshold) {
        anomalies.push({
          type: "REVENUE_DROP",
          severity: getSeverity(Math.abs(zScore)),
          storeId: sid,
          date: day.date,
          description: `Chute de CA anormale: ${day.revenue.toFixed(0)}€ vs moyenne ${mean(revenues).toFixed(0)}€`,
          evidence: {
            observed: day.revenue,
            expected: mean(revenues),
            deviation: Math.abs(zScore),
          },
        });
      }
    }
  }

  return anomalies;
}

// ─── Detector 3: Ghost Shifts ────────────────────

async function detectGhostShifts(
  since: Date,
  storeId?: string
): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  // Trouver les shifts sans pointage POS correspondant
  // FIX H4: Exclude today and future to avoid false positives on shifts that haven't happened yet
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(23, 59, 59, 999);

  const shifts = await prisma.shift.findMany({
    where: {
      date: { gte: since, lte: yesterday },
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

  const timeClocks = await prisma.posTimeClock.findMany({
    where: {
      date: { gte: since },
      ...(storeId ? { storeId } : {}),
    },
    select: {
      employeeId: true,
      storeId: true,
      date: true,
    },
  });

  // Index des pointages
  const clockIndex = new Set<string>();
  for (const tc of timeClocks) {
    const dateStr = (tc.date as Date).toISOString().split("T")[0];
    clockIndex.add(`${tc.employeeId}:${tc.storeId}:${dateStr}`);
  }

  // Shifts sans pointage
  for (const shift of shifts) {
    if (!shift.employeeId) continue;
    const dateStr = (shift.date as Date).toISOString().split("T")[0];
    const key = `${shift.employeeId}:${shift.storeId}:${dateStr}`;

    if (!clockIndex.has(key)) {
      anomalies.push({
        type: "GHOST_SHIFT",
        severity: "MEDIUM",
        employeeId: shift.employeeId,
        storeId: shift.storeId,
        date: shift.date as Date,
        description: `Shift planifié ${shift.startTime}-${shift.endTime} sans pointage POS`,
        evidence: {
          observed: 0,
          expected: 1,
          deviation: 1,
          rawData: {
            shiftId: shift.id,
            startTime: shift.startTime,
            endTime: shift.endTime,
          },
        },
        suggestedAction: "Vérifier si l'employé était présent ou s'il s'agit d'un oubli de pointage",
      });
    }
  }

  return anomalies;
}

// ─── Detector 4: Pattern Breaks ──────────────────

async function detectPatternBreaks(
  since: Date,
  storeId?: string
): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  // Analyser les horaires d'arrivée par employé
  const timeClocks = await prisma.posTimeClock.findMany({
    where: {
      date: { gte: since },
      ...(storeId ? { storeId } : {}),
    },
    select: {
      employeeId: true,
      storeId: true,
      date: true,
      clockIn: true,
    },
    orderBy: { date: "asc" },
  });

  const byEmployee = new Map<
    string,
    { storeId: string; date: Date; minutes: number }[]
  >();

  for (const tc of timeClocks) {
    if (!byEmployee.has(tc.employeeId)) {
      byEmployee.set(tc.employeeId, []);
    }
    const [h, m] = tc.clockIn.split(":").map(Number);
    byEmployee.get(tc.employeeId)!.push({
      storeId: tc.storeId,
      date: tc.date as Date,
      minutes: h * 60 + m,
    });
  }

  for (const [empId, records] of byEmployee) {
    if (records.length < 10) continue;

    const minutes = records.map((r) => r.minutes);

    for (const record of records.slice(-7)) {
      const zScore = calculateZScore(record.minutes, minutes);
      if (Math.abs(zScore) >= AI_CONFIG.anomaly.zScoreThreshold + 0.5) {
        anomalies.push({
          type: "PATTERN_BREAK",
          severity: getSeverity(Math.abs(zScore)),
          employeeId: empId,
          storeId: record.storeId,
          date: record.date,
          description: `Changement de pattern horaire: arrivée à ${Math.floor(record.minutes / 60)}h${String(record.minutes % 60).padStart(2, "0")} vs habitude ~${Math.floor(mean(minutes) / 60)}h${String(Math.round(mean(minutes) % 60)).padStart(2, "0")}`,
          evidence: {
            observed: record.minutes,
            expected: mean(minutes),
            deviation: Math.abs(zScore),
          },
        });
      }
    }
  }

  return anomalies;
}

// ─── Detector 5: Overtime Abuse ──────────────────

async function detectOvertimeAbuse(
  since: Date,
  storeId?: string
): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  // Charger les heures travaillées par employé par semaine
  const timeClocks = await prisma.posTimeClock.findMany({
    where: {
      date: { gte: since },
      workedHours: { not: null },
      ...(storeId ? { storeId } : {}),
    },
    select: {
      employeeId: true,
      storeId: true,
      date: true,
      workedHours: true,
    },
  });

  // Grouper par employé par semaine
  const weeklyByEmployee = new Map<string, Map<string, number>>();

  for (const tc of timeClocks) {
    if (!weeklyByEmployee.has(tc.employeeId)) {
      weeklyByEmployee.set(tc.employeeId, new Map());
    }
    const dateObj = tc.date as Date;
    const weekKey = getWeekKey(dateObj);
    const weekly = weeklyByEmployee.get(tc.employeeId)!;
    weekly.set(weekKey, (weekly.get(weekKey) || 0) + (tc.workedHours || 0));
  }

  // Charger les heures contractuelles
  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: { id: true, weeklyHours: true, maxHoursPerWeek: true },
  });
  const empMap = new Map(employees.map((e) => [e.id, e]));

  for (const [empId, weeklyHours] of weeklyByEmployee) {
    const emp = empMap.get(empId);
    if (!emp || !emp.weeklyHours) continue;

    const weeks = Array.from(weeklyHours.entries());
    const hours = weeks.map(([, h]) => h);

    for (const [weekKey, weekHours] of weeks) {
      // Dépassement significatif du contrat
      const overageRatio = weekHours / emp.weeklyHours;
      if (overageRatio > 1.3) {
        // > 130% du contrat
        const zScore = calculateZScore(weekHours, hours);
        anomalies.push({
          type: "OVERTIME_ABUSE",
          severity:
            overageRatio > 1.5 ? "HIGH" : "MEDIUM",
          employeeId: empId,
          storeId:
            timeClocks.find((tc) => tc.employeeId === empId)?.storeId ?? "unknown",
          date: getDateFromWeekKey(weekKey),
          description: `Heures sup excessives: ${weekHours.toFixed(1)}h vs ${emp.weeklyHours}h contractuelles (${Math.round(overageRatio * 100)}%)`,
          evidence: {
            observed: weekHours,
            expected: emp.weeklyHours,
            deviation: zScore,
            rawData: { weekKey, contractHours: emp.weeklyHours },
          },
          suggestedAction: `Vérifier les ${Math.round(weekHours - emp.weeklyHours)}h supplémentaires`,
        });
      }
    }
  }

  return anomalies;
}

// ─── Detector 6: Location Mismatch ──────────────

async function detectLocationMismatch(
  since: Date,
  storeId?: string
): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  // Charger les pointages avec distance
  const clockIns = await prisma.clockIn.findMany({
    where: {
      clockInAt: { gte: since },
      ...(storeId ? { storeId } : {}),
    },
    select: {
      employeeId: true,
      storeId: true,
      clockInAt: true,
      distanceMeters: true,
      latitude: true,
      longitude: true,
    },
  });

  // Identifier les pointages très éloignés du magasin
  for (const ci of clockIns) {
    if (ci.distanceMeters > 500) {
      // > 500m du magasin
      anomalies.push({
        type: "LOCATION_MISMATCH",
        severity: ci.distanceMeters > 2000 ? "HIGH" : "MEDIUM",
        employeeId: ci.employeeId,
        storeId: ci.storeId,
        date: ci.clockInAt,
        description: `Pointage à ${Math.round(ci.distanceMeters)}m du magasin`,
        evidence: {
          observed: ci.distanceMeters,
          expected: 100, // Distance attendue < 100m
          deviation: ci.distanceMeters / 100,
          rawData: {
            latitude: ci.latitude,
            longitude: ci.longitude,
          },
        },
        suggestedAction: "Vérifier la localisation du pointage",
      });
    }
  }

  return anomalies;
}

// ─── Statistics Helpers ──────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function calculateZScore(value: number, population: number[]): number {
  const avg = mean(population);
  const sd = stdDev(population);
  if (sd === 0) return 0;
  return (value - avg) / sd;
}

function getSeverity(zScore: number): AnomalySeverity {
  if (zScore >= 4) return "CRITICAL";
  if (zScore >= 3.5) return "HIGH";
  if (zScore >= 3) return "MEDIUM";
  return "LOW";
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function getDateFromWeekKey(weekKey: string): Date {
  return new Date(weekKey);
}

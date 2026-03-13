/**
 * AI Engine — Fraud Risk Scorer
 *
 * Agrège les anomalies détectées pour calculer un fraud_risk_score
 * global par employé (0-100).
 */

import type { DetectedAnomaly, AnomalyType } from "../types";

// ─── Weights ─────────────────────────────────────

const ANOMALY_WEIGHTS: Record<AnomalyType, number> = {
  CLOCK_DISCREPANCY: 15,
  REVENUE_DROP: 5,
  GHOST_SHIFT: 25,
  PATTERN_BREAK: 10,
  OVERTIME_ABUSE: 20,
  LOCATION_MISMATCH: 30,
};

const SEVERITY_MULTIPLIERS: Record<string, number> = {
  LOW: 0.5,
  MEDIUM: 1.0,
  HIGH: 1.5,
  CRITICAL: 2.0,
};

// ─── Scorer ──────────────────────────────────────

export interface EmployeeFraudScore {
  employeeId: string;
  fraudRiskScore: number;
  breakdown: {
    type: AnomalyType;
    count: number;
    contribution: number;
  }[];
  totalAnomalies: number;
}

/**
 * Calcule le score de risque de fraude pour chaque employé
 * basé sur les anomalies détectées.
 */
export function calculateFraudScores(
  anomalies: DetectedAnomaly[]
): EmployeeFraudScore[] {
  // Grouper par employé
  const byEmployee = new Map<string, DetectedAnomaly[]>();

  for (const anomaly of anomalies) {
    if (!anomaly.employeeId) continue;
    if (!byEmployee.has(anomaly.employeeId)) {
      byEmployee.set(anomaly.employeeId, []);
    }
    byEmployee.get(anomaly.employeeId)!.push(anomaly);
  }

  const results: EmployeeFraudScore[] = [];

  for (const [employeeId, empAnomalies] of byEmployee) {
    // Compter par type
    const typeCounts = new Map<AnomalyType, { count: number; maxSeverity: string }>();

    for (const a of empAnomalies) {
      if (!typeCounts.has(a.type)) {
        typeCounts.set(a.type, { count: 0, maxSeverity: "LOW" });
      }
      const tc = typeCounts.get(a.type)!;
      tc.count++;
      // Garder la sévérité max
      const severityOrder = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
      if (severityOrder.indexOf(a.severity) > severityOrder.indexOf(tc.maxSeverity)) {
        tc.maxSeverity = a.severity;
      }
    }

    // Calculer le score
    let totalScore = 0;
    const breakdown: EmployeeFraudScore["breakdown"] = [];

    for (const [type, { count, maxSeverity }] of typeCounts) {
      const weight = ANOMALY_WEIGHTS[type] || 10;
      const multiplier = SEVERITY_MULTIPLIERS[maxSeverity] || 1;
      // Diminishing returns: log(count + 1) pour éviter l'inflation
      const contribution = weight * multiplier * Math.log2(count + 1);
      totalScore += contribution;

      breakdown.push({
        type,
        count,
        contribution: Math.round(contribution * 100) / 100,
      });
    }

    // Normaliser à 0-100
    const fraudRiskScore = Math.min(100, Math.round(totalScore));

    results.push({
      employeeId,
      fraudRiskScore,
      breakdown: breakdown.sort((a, b) => b.contribution - a.contribution),
      totalAnomalies: empAnomalies.length,
    });
  }

  // Trier par score décroissant
  return results.sort((a, b) => b.fraudRiskScore - a.fraudRiskScore);
}

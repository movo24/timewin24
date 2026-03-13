/**
 * AI Engine — Alert Generator
 *
 * Persiste les anomalies detectees en DB et cree
 * optionnellement des ManagerAlerts.
 */

import { prisma } from "@/lib/prisma";
import { AI_CONFIG, isFeatureEnabled } from "../config";
import type { DetectedAnomaly } from "../types";
import { calculateFraudScores, type EmployeeFraudScore } from "./fraud-scorer";

// ─── Types ───────────────────────────────────────

export interface AlertGenerationResult {
  anomaliesSaved: number;
  alertsCreated: number;
  fraudScores: EmployeeFraudScore[];
}

// ─── Helpers ────────────────────────────────────

/**
 * FIX C2: Normalize date to midnight UTC for @db.Date columns
 */
function toDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Generator ───────────────────────────────────

/**
 * Persiste les anomalies detectees et cree des alertes manager si necessaire
 */
export async function generateAlerts(
  anomalies: DetectedAnomaly[]
): Promise<AlertGenerationResult> {
  if (!isFeatureEnabled("anomalyDetection")) {
    return { anomaliesSaved: 0, alertsCreated: 0, fraudScores: [] };
  }

  let anomaliesSaved = 0;
  let alertsCreated = 0;

  // 1. Persister les anomalies en DB
  for (const anomaly of anomalies) {
    // FIX C3: Skip anomalies with missing/invalid storeId
    if (!anomaly.storeId || anomaly.storeId === "unknown") {
      console.warn(`[AI Engine] Skipping anomaly with missing storeId: ${anomaly.type}`);
      continue;
    }
    try {
      await prisma.aiAnomaly.create({
        data: {
          type: anomaly.type,
          severity: anomaly.severity,
          status: "DETECTED",
          employeeId: anomaly.employeeId || null,
          storeId: anomaly.storeId,
          date: toDateOnly(anomaly.date),
          description: anomaly.description,
          evidence: JSON.parse(JSON.stringify(anomaly.evidence)),
          suggestedAction: anomaly.suggestedAction || null,
        },
      });
      anomaliesSaved++;
    } catch (err) {
      // Skip duplicates or errors silently
      console.warn(`[AI Engine] Failed to save anomaly: ${(err as Error).message}`);
    }
  }

  // 2. Calculer les fraud scores
  const fraudScores = calculateFraudScores(anomalies);

  // 3. Mettre a jour les metriques IA avec les fraud scores
  for (const fs of fraudScores) {
    try {
      await prisma.employeeAiMetrics.upsert({
        where: { employeeId: fs.employeeId },
        create: {
          employeeId: fs.employeeId,
          fraudRiskScore: fs.fraudRiskScore,
        },
        update: {
          fraudRiskScore: fs.fraudRiskScore,
        },
      });
    } catch {
      // Ignore
    }
  }

  // 4. Creer des ManagerAlerts pour les anomalies critiques/hautes
  const criticalAnomalies = anomalies.filter(
    (a) => a.severity === "CRITICAL" || a.severity === "HIGH"
  );

  for (const anomaly of criticalAnomalies) {
    // FIX C3: Skip alerts when storeId is empty/invalid (FK constraint)
    if (!anomaly.storeId || anomaly.storeId === "unknown") {
      console.warn(`[AI Engine] Skipping alert for anomaly with missing storeId: ${anomaly.type}`);
      continue;
    }
    try {
      const dateOnly = toDateOnly(anomaly.date);
      const contextKey = `ai-anomaly:${anomaly.type}:${anomaly.employeeId || "store"}:${dateOnly.toISOString().split("T")[0]}`;

      await prisma.managerAlert.upsert({
        where: {
          type_storeId_date_contextKey: {
            type: "AI_ANOMALY_DETECTED",
            storeId: anomaly.storeId,
            date: dateOnly,
            contextKey,
          },
        },
        create: {
          type: "AI_ANOMALY_DETECTED",
          severity: anomaly.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
          status: "UNREAD",
          storeId: anomaly.storeId,
          date: dateOnly,
          title: `${anomaly.description}`,
          details: anomaly.suggestedAction || undefined,
          contextKey,
        },
        update: {
          title: `${anomaly.description}`,
          details: anomaly.suggestedAction || undefined,
        },
      });
      alertsCreated++;
    } catch {
      // Skip duplicates
    }
  }

  // 5. Alertes pour les employes a haut risque de fraude
  for (const fs of fraudScores) {
    if (fs.fraudRiskScore >= AI_CONFIG.anomaly.fraudAlertThreshold) {
      const firstAnomaly = anomalies.find(
        (a) => a.employeeId === fs.employeeId
      );
      const storeId = firstAnomaly?.storeId;

      // FIX C3: Skip fraud alerts when no valid storeId found
      if (!storeId || storeId === "unknown") {
        console.warn(`[AI Engine] Skipping fraud alert for employee ${fs.employeeId}: no valid storeId`);
        continue;
      }

      try {
        const today = toDateOnly(new Date());
        const contextKey = `ai-fraud:${fs.employeeId}:${today.toISOString().split("T")[0]}`;

        await prisma.managerAlert.upsert({
          where: {
            type_storeId_date_contextKey: {
              type: "AI_ANOMALY_DETECTED",
              storeId,
              date: today,
              contextKey,
            },
          },
          create: {
            type: "AI_ANOMALY_DETECTED",
            severity: fs.fraudRiskScore >= 85 ? "CRITICAL" : "WARNING",
            status: "UNREAD",
            storeId,
            date: today,
            title: `Risque fraude eleve: score ${fs.fraudRiskScore}/100 (${fs.totalAnomalies} anomalies)`,
            details: fs.breakdown
              .map((b) => `${b.type}: ${b.count}x (impact: ${b.contribution})`)
              .join(", "),
            contextKey,
          },
          update: {
            title: `Risque fraude eleve: score ${fs.fraudRiskScore}/100 (${fs.totalAnomalies} anomalies)`,
          },
        });
        alertsCreated++;
      } catch {
        // Skip
      }
    }
  }

  console.log(
    `[AI Engine] Alert generation: ${anomaliesSaved} anomalies saved, ${alertsCreated} alerts created, ${fraudScores.length} fraud scores`
  );

  return { anomaliesSaved, alertsCreated, fraudScores };
}

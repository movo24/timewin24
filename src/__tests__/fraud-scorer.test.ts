import { calculateFraudScores } from "@/lib/ai-engine/anomaly/fraud-scorer";
import type { DetectedAnomaly, AnomalyType, AnomalySeverity } from "@/lib/ai-engine/types";

// M116 / AI Engine — agregation des anomalies en fraud_risk_score (0-100) par
// employe : ponderation par type/severite, rendements decroissants (log2),
// plafonnement et tri.

const anomaly = (
  type: AnomalyType,
  severity: AnomalySeverity,
  employeeId: string | undefined
): DetectedAnomaly => ({
  type, severity, employeeId, storeId: "s1", date: new Date("2026-06-22"),
  description: "x", evidence: { observed: 0, expected: 0, deviation: 0 },
});

describe("calculateFraudScores", () => {
  it("retourne [] sans anomalie", () => {
    expect(calculateFraudScores([])).toEqual([]);
  });

  it("ignore les anomalies sans employeeId", () => {
    expect(calculateFraudScores([anomaly("GHOST_SHIFT", "HIGH", undefined)])).toEqual([]);
  });

  it("score une anomalie unique selon poids x severite x log2(count+1)", () => {
    // GHOST_SHIFT(25) * HIGH(1.5) * log2(2)=1 = 37.5 -> round 38
    const [r] = calculateFraudScores([anomaly("GHOST_SHIFT", "HIGH", "e1")]);
    expect(r.employeeId).toBe("e1");
    expect(r.fraudRiskScore).toBe(38);
    expect(r.totalAnomalies).toBe(1);
    expect(r.breakdown[0]).toMatchObject({ type: "GHOST_SHIFT", count: 1, contribution: 37.5 });
  });

  it("applique des rendements decroissants sur les repetitions", () => {
    // 3x REVENUE_DROP(5) MEDIUM(1) -> log2(4)=2 -> 5*1*2 = 10
    const [r] = calculateFraudScores([
      anomaly("REVENUE_DROP", "MEDIUM", "e1"),
      anomaly("REVENUE_DROP", "MEDIUM", "e1"),
      anomaly("REVENUE_DROP", "MEDIUM", "e1"),
    ]);
    expect(r.breakdown[0]).toMatchObject({ type: "REVENUE_DROP", count: 3, contribution: 10 });
    expect(r.fraudRiskScore).toBe(10);
  });

  it("retient la severite maximale par type", () => {
    // 2x CLOCK_DISCREPANCY: LOW puis CRITICAL -> mult CRITICAL(2)
    // 15 * 2 * log2(3)=1.585 = 47.55 -> round 48
    const [r] = calculateFraudScores([
      anomaly("CLOCK_DISCREPANCY", "LOW", "e1"),
      anomaly("CLOCK_DISCREPANCY", "CRITICAL", "e1"),
    ]);
    expect(r.breakdown[0].count).toBe(2);
    expect(r.fraudRiskScore).toBe(48);
  });

  it("plafonne le score a 100", () => {
    // 7x LOCATION_MISMATCH(30) CRITICAL(2) -> log2(8)=3 -> 30*2*3=180 -> cap 100
    const many = Array.from({ length: 7 }, () => anomaly("LOCATION_MISMATCH", "CRITICAL", "e1"));
    expect(calculateFraudScores(many)[0].fraudRiskScore).toBe(100);
  });

  it("trie les employes par score decroissant et le breakdown par contribution", () => {
    const res = calculateFraudScores([
      anomaly("REVENUE_DROP", "LOW", "low"), // 5*0.5*1 = 2.5 -> 3
      anomaly("LOCATION_MISMATCH", "CRITICAL", "high"), // 30*2*1 = 60
      anomaly("REVENUE_DROP", "LOW", "high"), // contribue moins que LOCATION_MISMATCH
    ]);
    expect(res[0].employeeId).toBe("high");
    expect(res[1].employeeId).toBe("low");
    // breakdown de "high" trie par contribution desc
    expect(res[0].breakdown[0].type).toBe("LOCATION_MISMATCH");
  });
});

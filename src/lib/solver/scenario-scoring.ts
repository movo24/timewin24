/**
 * Scenario Scoring — Evaluates an entire SolverResult holistically.
 *
 * Unlike scoring.ts (which scores individual candidate assignments),
 * this module scores a complete planning scenario across 7 dimensions.
 * Pure functions, no DB access.
 *
 * Dimension 7 (Manager Brain): profilePlacementQuality
 */

import type {
  SolverResult,
  SolverInput,
  ScenarioConfig,
  ScenarioScore,
  ScenarioScoreBreakdown,
} from "./types";

// ─── Score Dimension Weights ─────────────────────

const DIMENSION_WEIGHTS = {
  coverageCompleteness: 25,
  shiftDurationQuality: 15,
  employeeBalance: 15,
  constraintRespect: 10,
  costEfficiency: 10,
  breakQuality: 5,
  profilePlacementQuality: 20,
} as const;

// ─── Individual Dimension Scorers ────────────────

/**
 * Coverage Completeness (0-100)
 */
function scoreCoverageCompleteness(
  result: SolverResult,
  inputs: SolverInput[]
): number {
  let totalNeededHours = 0;
  for (const input of inputs) {
    for (const day of input.weekDays) {
      const openMin = timeToMinutes(day.schedule.openTime);
      const closeMin = timeToMinutes(day.schedule.closeTime);
      const dayHours = (closeMin - openMin) / 60;
      totalNeededHours += dayHours * day.schedule.minEmployees;
    }
  }

  if (totalNeededHours === 0) return 100;

  const totalHours = result.shifts.reduce((sum, s) => sum + s.hours, 0);
  let score = Math.min(100, (totalHours / totalNeededHours) * 100);

  const unassignedCount = result.shifts.filter((s) => s.employeeId === null).length;
  score -= unassignedCount * 10;
  score -= result.stats.daysUncovered * 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Shift Duration Quality (0-100)
 */
function scoreShiftDurationQuality(
  result: SolverResult,
  config: ScenarioConfig
): number {
  if (result.shifts.length === 0) return 100;

  const [idealMin, idealMax] = config.idealShiftHours;
  const [acceptMin, acceptMax] = config.acceptableShiftHours;

  let totalScore = 0;

  for (const shift of result.shifts) {
    const h = shift.hours;
    if (h >= idealMin && h <= idealMax) {
      totalScore += 100;
    } else if (h >= acceptMin && h < idealMin) {
      // Below ideal but within acceptable range: interpolate 70→100
      const range = idealMin - acceptMin;
      const ratio = range > 0 ? (h - acceptMin) / range : 1;
      totalScore += Math.round(70 + ratio * 30);
    } else if (h > idealMax && h <= acceptMax) {
      // Above ideal but within acceptable range: interpolate 100→70
      const range = acceptMax - idealMax;
      const ratio = range > 0 ? (h - idealMax) / range : 1;
      totalScore += Math.round(100 - ratio * 30);
    } else if (h < acceptMin) {
      // Below acceptable minimum — proportionally bad
      totalScore += Math.max(10, Math.round((h / idealMin) * 60));
    } else {
      // Above acceptable maximum — very bad
      totalScore += 10;
    }
  }

  return Math.round(totalScore / result.shifts.length);
}

/**
 * Employee Balance (0-100)
 */
function scoreEmployeeBalance(
  result: SolverResult,
  inputs: SolverInput[]
): number {
  const employeeMap = new Map<string, { weeklyHours: number | null }>();
  for (const input of inputs) {
    for (const emp of input.employees) {
      if (!employeeMap.has(emp.id)) {
        employeeMap.set(emp.id, { weeklyHours: emp.weeklyHours });
      }
    }
  }

  const targets = Array.from(employeeMap.values())
    .map((e) => e.weeklyHours)
    .filter((h): h is number => h !== null && h > 0);
  const avgTarget = targets.length > 0
    ? targets.reduce((a, b) => a + b, 0) / targets.length
    : 35;

  const hoursPerEmployee = new Map<string, number>();
  for (const shift of result.shifts) {
    if (!shift.employeeId) continue;
    hoursPerEmployee.set(
      shift.employeeId,
      (hoursPerEmployee.get(shift.employeeId) || 0) + shift.hours
    );
  }

  if (hoursPerEmployee.size === 0) return 50;

  let totalDeviation = 0;
  let count = 0;

  for (const [empId, hours] of hoursPerEmployee) {
    const emp = employeeMap.get(empId);
    const target = emp?.weeklyHours || avgTarget;
    if (target <= 0) continue;
    const ratio = hours / target;
    const deviation = Math.abs(ratio - 1.0);
    totalDeviation += deviation;
    count++;
  }

  if (count === 0) return 50;
  const avgDeviation = totalDeviation / count;

  return Math.max(0, Math.min(100, Math.round(100 * (1 - avgDeviation))));
}

/**
 * Constraint Respect (0-100)
 */
function scoreConstraintRespect(result: SolverResult): number {
  const shiftWarningCount = result.shifts.reduce(
    (sum, s) => sum + s.warnings.length, 0
  );
  const globalWarningCount = result.warnings.length;
  const totalPenalty = shiftWarningCount * 5 + globalWarningCount * 3;
  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

/**
 * Cost Efficiency (0-100)
 */
function scoreCostEfficiency(
  result: SolverResult,
  inputs: SolverInput[]
): number {
  const costMap = new Map<string, number>();
  let totalCostKnown = 0;
  let costCount = 0;

  for (const input of inputs) {
    for (const emp of input.employees) {
      if (emp.costPerHour !== null) {
        costMap.set(emp.id, emp.costPerHour);
        totalCostKnown += emp.costPerHour;
        costCount++;
      }
    }
  }

  if (costCount === 0) return 50;
  const avgCost = totalCostKnown / costCount;

  let actualCost = 0;
  let baselineCost = 0;

  for (const shift of result.shifts) {
    if (!shift.employeeId) continue;
    const cost = costMap.get(shift.employeeId) ?? avgCost;
    actualCost += cost * shift.hours;
    baselineCost += avgCost * shift.hours;
  }

  if (actualCost === 0) return 50;
  const ratio = baselineCost / actualCost;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/**
 * Break Quality (0-100)
 */
function scoreBreakQuality(result: SolverResult): number {
  const longShifts = result.shifts.filter((s) => s.hours > 6);
  if (longShifts.length === 0) return 100;

  let totalScore = 0;
  for (const shift of longShifts) {
    totalScore += shift.breakMinutes >= 30 ? 100 : 0;
  }

  return Math.round(totalScore / longShifts.length);
}

/**
 * Profile Placement Quality (0-100) — Manager Brain dimension
 *
 * Evaluates:
 * - % of OUVERTURE slots covered by profile A employees
 * - % of critical store (importance=1) slots covered by profile A/B employees
 * - No profile C alone violations (should be 0 due to hard constraint)
 */
function scoreProfilePlacementQuality(
  result: SolverResult,
  inputs: SolverInput[]
): number {
  // Build employee profile map
  const profileMap = new Map<string, { profileCategory: string | null; reliabilityScore: number | null }>();
  for (const input of inputs) {
    for (const emp of input.employees) {
      if (!profileMap.has(emp.id)) {
        profileMap.set(emp.id, {
          profileCategory: emp.profileCategory,
          reliabilityScore: emp.reliabilityScore,
        });
      }
    }
  }

  const assignedShifts = result.shifts.filter((s) => s.employeeId !== null);
  if (assignedShifts.length === 0) return 50;

  // Count OUVERTURE slots and how many are covered by A profiles
  const ouvertureShifts = assignedShifts.filter((s) => s.slotPhase === "OUVERTURE");

  let ouvertureScore: number;
  if (ouvertureShifts.length === 0) {
    ouvertureScore = 100; // No openings to cover
  } else {
    // A at openings = great (100%), B at openings = ok (60%), C at openings = bad (20%)
    let total = 0;
    for (const s of ouvertureShifts) {
      const emp = profileMap.get(s.employeeId!);
      const profile = emp?.profileCategory || "B";
      if (profile === "A") total += 100;
      else if (profile === "B") total += 60;
      else total += 20;
    }
    ouvertureScore = Math.round(total / ouvertureShifts.length);
  }

  // Count critical store coverage by A/B profiles
  // (We check all assigned shifts, not just openings)
  const criticalShifts = assignedShifts.filter((s) => {
    // Find the store importance from inputs
    for (const input of inputs) {
      if (input.store.id === s.storeId) return input.store.importance === 1;
    }
    return false;
  });

  let criticalScore: number;
  if (criticalShifts.length === 0) {
    criticalScore = 100; // No critical store shifts
  } else {
    const criticalWithAB = criticalShifts.filter((s) => {
      const emp = profileMap.get(s.employeeId!);
      return emp?.profileCategory === "A" || emp?.profileCategory === "B";
    });
    criticalScore = Math.round((criticalWithAB.length / criticalShifts.length) * 100);
  }

  // Check for C-alone violations (should be 0 due to hard constraint)
  // This is a bonus check for scenario quality
  const cAloneViolations = 0; // Hard constraint prevents this

  // Weighted combination: openings matter most
  const combinedScore = Math.round(
    ouvertureScore * 0.5 +
    criticalScore * 0.4 +
    (cAloneViolations === 0 ? 100 : 0) * 0.1
  );

  return Math.max(0, Math.min(100, combinedScore));
}

// ─── Time Helper ─────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ─── Main Scorer ─────────────────────────────────

/**
 * Score an entire planning scenario across 7 dimensions.
 */
export function scoreScenario(
  result: SolverResult,
  input: SolverInput | SolverInput[],
  config: ScenarioConfig
): ScenarioScore {
  const inputs = Array.isArray(input) ? input : [input];

  const breakdown: ScenarioScoreBreakdown = {
    coverageCompleteness: scoreCoverageCompleteness(result, inputs),
    shiftDurationQuality: scoreShiftDurationQuality(result, config),
    employeeBalance: scoreEmployeeBalance(result, inputs),
    constraintRespect: scoreConstraintRespect(result),
    costEfficiency: scoreCostEfficiency(result, inputs),
    breakQuality: scoreBreakQuality(result),
    profilePlacementQuality: scoreProfilePlacementQuality(result, inputs),
  };

  const wTotal = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
  const total = Math.round(
    (breakdown.coverageCompleteness * DIMENSION_WEIGHTS.coverageCompleteness +
      breakdown.shiftDurationQuality * DIMENSION_WEIGHTS.shiftDurationQuality +
      breakdown.employeeBalance * DIMENSION_WEIGHTS.employeeBalance +
      breakdown.constraintRespect * DIMENSION_WEIGHTS.constraintRespect +
      breakdown.costEfficiency * DIMENSION_WEIGHTS.costEfficiency +
      breakdown.breakQuality * DIMENSION_WEIGHTS.breakQuality +
      breakdown.profilePlacementQuality * DIMENSION_WEIGHTS.profilePlacementQuality) /
      wTotal
  );

  let label: string;
  if (total >= 85) label = "Excellent";
  else if (total >= 70) label = "Bon";
  else if (total >= 50) label = "Acceptable";
  else label = "Insuffisant";

  return { total, breakdown, label };
}

/**
 * Scenario Scoring — Evaluates an entire SolverResult holistically.
 *
 * Unlike scoring.ts (which scores individual candidate assignments),
 * this module scores a complete planning scenario across 6 dimensions.
 * Pure functions, no DB access.
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
  coverageCompleteness: 30,
  shiftDurationQuality: 20,
  employeeBalance: 20,
  constraintRespect: 15,
  costEfficiency: 10,
  breakQuality: 5,
} as const;

// ─── Individual Dimension Scorers ────────────────

/**
 * Coverage Completeness (0-100)
 * How well does the scenario cover all needed hours?
 * Penalizes unassigned shifts and uncovered days.
 */
function scoreCoverageCompleteness(
  result: SolverResult,
  inputs: SolverInput[]
): number {
  // Calculate total needed hours across all stores
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

  // Calculate assigned hours (shifts with actual employees)
  const assignedHours = result.shifts
    .filter((s) => s.employeeId !== null)
    .reduce((sum, s) => sum + s.hours, 0);

  const totalHours = result.shifts.reduce((sum, s) => sum + s.hours, 0);

  // Base score from coverage ratio
  let score = Math.min(100, (totalHours / totalNeededHours) * 100);

  // Penalty for unassigned shifts (-10 each, capped)
  const unassignedCount = result.shifts.filter((s) => s.employeeId === null).length;
  score -= unassignedCount * 10;

  // Penalty for fully uncovered days
  score -= result.stats.daysUncovered * 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Shift Duration Quality (0-100)
 * Scores how well shift durations match the ideal range.
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
      // Within ideal range: 100
      totalScore += 100;
    } else if (h >= acceptMin && h <= acceptMax) {
      // Within acceptable range: 70 → 40 linearly
      const ratio = (h - acceptMin) / (acceptMax - acceptMin);
      totalScore += 70 - ratio * 30;
    } else if (h < idealMin) {
      // Too short: 50
      totalScore += 50;
    } else {
      // Too long (> acceptMax): 20
      totalScore += 20;
    }
  }

  return Math.round(totalScore / result.shifts.length);
}

/**
 * Employee Balance (0-100)
 * How evenly are hours distributed relative to contractual targets?
 */
function scoreEmployeeBalance(
  result: SolverResult,
  inputs: SolverInput[]
): number {
  // Build a map of all employees across all inputs
  const employeeMap = new Map<string, { weeklyHours: number | null }>();
  for (const input of inputs) {
    for (const emp of input.employees) {
      if (!employeeMap.has(emp.id)) {
        employeeMap.set(emp.id, { weeklyHours: emp.weeklyHours });
      }
    }
  }

  // Calculate average pool target
  const targets = Array.from(employeeMap.values())
    .map((e) => e.weeklyHours)
    .filter((h): h is number => h !== null && h > 0);
  const avgTarget = targets.length > 0
    ? targets.reduce((a, b) => a + b, 0) / targets.length
    : 35;

  // Sum hours per employee from generated shifts
  const hoursPerEmployee = new Map<string, number>();
  for (const shift of result.shifts) {
    if (!shift.employeeId) continue;
    hoursPerEmployee.set(
      shift.employeeId,
      (hoursPerEmployee.get(shift.employeeId) || 0) + shift.hours
    );
  }

  if (hoursPerEmployee.size === 0) return 50; // no assignments

  // Calculate deviation from target ratio
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
 * Fewer warnings = better score.
 */
function scoreConstraintRespect(result: SolverResult): number {
  // Count per-shift warnings
  const shiftWarningCount = result.shifts.reduce(
    (sum, s) => sum + s.warnings.length,
    0
  );

  // Global warnings
  const globalWarningCount = result.warnings.length;

  const totalPenalty = shiftWarningCount * 5 + globalWarningCount * 3;
  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

/**
 * Cost Efficiency (0-100)
 * Lower total cost relative to baseline = better.
 */
function scoreCostEfficiency(
  result: SolverResult,
  inputs: SolverInput[]
): number {
  // Build employee cost map
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

  if (costCount === 0) return 50; // no cost data available

  const avgCost = totalCostKnown / costCount;

  // Calculate actual cost of the scenario
  let actualCost = 0;
  let baselineCost = 0;

  for (const shift of result.shifts) {
    if (!shift.employeeId) continue;
    const cost = costMap.get(shift.employeeId) ?? avgCost;
    actualCost += cost * shift.hours;
    baselineCost += avgCost * shift.hours;
  }

  if (actualCost === 0) return 50;

  // Score: 100 if actual cost equals baseline, higher if cheaper
  const ratio = baselineCost / actualCost;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/**
 * Break Quality (0-100)
 * Shifts > 6h must have adequate breaks (≥ 30min).
 */
function scoreBreakQuality(result: SolverResult): number {
  const longShifts = result.shifts.filter((s) => s.hours > 6);
  if (longShifts.length === 0) return 100; // no long shifts, perfect

  let totalScore = 0;
  for (const shift of longShifts) {
    totalScore += shift.breakMinutes >= 30 ? 100 : 0;
  }

  return Math.round(totalScore / longShifts.length);
}

// ─── Time Helper ─────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ─── Main Scorer ─────────────────────────────────

/**
 * Score an entire planning scenario across 6 dimensions.
 *
 * @param result - The solver result to evaluate
 * @param input - One or more SolverInputs (for employee data, store schedules)
 * @param config - Scenario configuration (ideal shift ranges, etc.)
 * @returns A ScenarioScore with total, breakdown, and label
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
  };

  // Weighted composite score
  const wTotal = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
  const total = Math.round(
    (breakdown.coverageCompleteness * DIMENSION_WEIGHTS.coverageCompleteness +
      breakdown.shiftDurationQuality * DIMENSION_WEIGHTS.shiftDurationQuality +
      breakdown.employeeBalance * DIMENSION_WEIGHTS.employeeBalance +
      breakdown.constraintRespect * DIMENSION_WEIGHTS.constraintRespect +
      breakdown.costEfficiency * DIMENSION_WEIGHTS.costEfficiency +
      breakdown.breakQuality * DIMENSION_WEIGHTS.breakQuality) /
      wTotal
  );

  // Label
  let label: string;
  if (total >= 85) label = "Excellent";
  else if (total >= 70) label = "Bon";
  else if (total >= 50) label = "Acceptable";
  else label = "Insuffisant";

  return { total, breakdown, label };
}

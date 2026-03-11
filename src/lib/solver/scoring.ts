/**
 * Soft Constraint Scoring — Pure functions, no DB access.
 * Each returns a score between 0.0 (worst) and 1.0 (best).
 * The solver uses a weighted composite score to rank candidates.
 */

import type { SolverEmployee, EmployeeState } from "./types";

export interface ScoringWeights {
  contractualTarget: number; // closeness to weekly hours target
  priorityBonus: number; // CDI > CDD > extras
  preferredStore: number; // employee prefers this store
  costEfficiency: number; // lower cost is better
  fairDistribution: number; // balance hours across employees
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  contractualTarget: 30,
  priorityBonus: 20,
  preferredStore: 10,
  costEfficiency: 15,
  fairDistribution: 25,
};

/** Scoring profile presets for multi-scenario solver */
export const SCORING_PROFILES: Record<string, ScoringWeights> = {
  balanced: DEFAULT_WEIGHTS,
  "coverage-first": {
    contractualTarget: 20,
    priorityBonus: 10,
    preferredStore: 5,
    costEfficiency: 10,
    fairDistribution: 55,
  },
  "cost-first": {
    contractualTarget: 25,
    priorityBonus: 15,
    preferredStore: 10,
    costEfficiency: 35,
    fairDistribution: 15,
  },
};

/**
 * How close is the employee to their contractual weekly target?
 * Highest when assigning this shift brings them closer to target.
 */
export function scoreContractualTarget(
  currentWeeklyHours: number,
  shiftHours: number,
  targetHours: number | null
): number {
  if (!targetHours || targetHours <= 0) return 0.5; // neutral
  const afterAssignment = currentWeeklyHours + shiftHours;
  if (afterAssignment > targetHours) {
    // Over target: reduce score proportionally
    return Math.max(0, 1 - (afterAssignment - targetHours) / targetHours);
  }
  // Under target: score based on how much gap this fills
  const gapBefore = targetHours - currentWeeklyHours;
  return gapBefore > 0 ? Math.min(1, shiftHours / gapBefore) : 0.5;
}

/**
 * Priority bonus: CDI=1 → 1.0, CDD=2 → 0.5, Extra=3 → 0.2
 */
export function scorePriority(priority: number): number {
  if (priority === 1) return 1.0;
  if (priority === 2) return 0.5;
  return 0.2;
}

/**
 * Preferred store match.
 */
export function scorePreferredStore(
  preferredStoreId: string | null,
  targetStoreId: string
): number {
  if (!preferredStoreId) return 0.5; // neutral
  return preferredStoreId === targetStoreId ? 1.0 : 0.2;
}

/**
 * Cost efficiency: lower cost = higher score.
 * Normalized between min and max cost in the employee pool.
 */
export function scoreCostEfficiency(
  costPerHour: number | null,
  minCostInPool: number,
  maxCostInPool: number
): number {
  if (costPerHour === null || maxCostInPool <= minCostInPool) return 0.5;
  return 1 - (costPerHour - minCostInPool) / (maxCostInPool - minCostInPool);
}

/**
 * Fair distribution: favor employees with the most remaining
 * gap between current hours and their weekly target.
 */
export function scoreFairDistribution(
  currentWeeklyHours: number,
  targetHours: number | null,
  avgPoolHours: number
): number {
  const target = targetHours || avgPoolHours || 35;
  if (target <= 0) return 0.5;
  const remaining = Math.max(0, target - currentWeeklyHours);
  return Math.min(1.0, remaining / target);
}

/**
 * Combined weighted score for a candidate assignment.
 */
export function calculateCandidateScore(
  employee: SolverEmployee,
  state: EmployeeState,
  shiftHours: number,
  storeId: string,
  minCost: number,
  maxCost: number,
  avgPoolHours: number,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): number {
  const wTotal =
    weights.contractualTarget +
    weights.priorityBonus +
    weights.preferredStore +
    weights.costEfficiency +
    weights.fairDistribution;

  if (wTotal === 0) return 0;

  const s1 = scoreContractualTarget(
    state.weeklyHoursAssigned,
    shiftHours,
    employee.weeklyHours
  );
  const s2 = scorePriority(employee.priority);
  const s3 = scorePreferredStore(employee.preferredStoreId, storeId);
  const s4 = scoreCostEfficiency(employee.costPerHour, minCost, maxCost);
  const s5 = scoreFairDistribution(
    state.weeklyHoursAssigned,
    employee.weeklyHours,
    avgPoolHours
  );

  return (
    (s1 * weights.contractualTarget +
      s2 * weights.priorityBonus +
      s3 * weights.preferredStore +
      s4 * weights.costEfficiency +
      s5 * weights.fairDistribution) /
    wTotal
  );
}

/**
 * Soft Constraint Scoring — Pure functions, no DB access.
 * Each returns a score between 0.0 (worst) and 1.0 (best).
 * The solver uses a weighted composite score to rank candidates.
 */

import type { SolverEmployee, EmployeeState, SlotPhase } from "./types";

export interface ScoringWeights {
  contractualTarget: number; // closeness to weekly hours target
  priorityBonus: number; // CDI > CDD > extras
  preferredStore: number; // employee prefers this store
  costEfficiency: number; // lower cost is better
  fairDistribution: number; // balance hours across employees
  reliabilityMatch: number; // Manager Brain: profile fit for slot
  storeImportanceMatch: number; // Manager Brain: strong profiles for important stores
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  contractualTarget: 20,
  priorityBonus: 10,
  preferredStore: 10,
  costEfficiency: 10,
  fairDistribution: 20,
  reliabilityMatch: 20,
  storeImportanceMatch: 10,
};

/** Scoring profile presets for multi-scenario solver */
export const SCORING_PROFILES: Record<string, ScoringWeights> = {
  balanced: DEFAULT_WEIGHTS,
  "coverage-first": {
    contractualTarget: 15,
    priorityBonus: 5,
    preferredStore: 5,
    costEfficiency: 5,
    fairDistribution: 40,
    reliabilityMatch: 20,
    storeImportanceMatch: 10,
  },
  "cost-first": {
    contractualTarget: 20,
    priorityBonus: 10,
    preferredStore: 10,
    costEfficiency: 30,
    fairDistribution: 10,
    reliabilityMatch: 15,
    storeImportanceMatch: 5,
  },
  "manager-brain": {
    contractualTarget: 15,
    priorityBonus: 5,
    preferredStore: 10,
    costEfficiency: 5,
    fairDistribution: 15,
    reliabilityMatch: 35,
    storeImportanceMatch: 15,
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
 * Manager Brain: Reliability match score.
 * How well does the employee's profile match the slot's criticality?
 *
 * A at opening or critical store = strong bonus
 * C at opening or critical store = strong penalty
 * C in midday = slight bonus (less critical)
 */
export function scoreReliabilityMatch(
  reliabilityScore: number | null,
  profileCategory: "A" | "B" | "C" | null,
  slotPhase: SlotPhase,
  storeImportance: number,
): number {
  const score = reliabilityScore ?? 50;
  const normalized = score / 100;

  // A at opening or critical store = boosted
  if (profileCategory === "A" && (slotPhase === "OUVERTURE" || storeImportance === 1))
    return Math.min(1.0, normalized * 1.3);
  // C at opening or critical store = penalized
  if (profileCategory === "C" && (slotPhase === "OUVERTURE" || storeImportance === 1))
    return normalized * 0.3;
  // C in midday = slight bonus (better fit)
  if (profileCategory === "C" && slotPhase === "MILIEU")
    return Math.min(1.0, normalized * 1.1);
  return normalized;
}

/**
 * Manager Brain: Store importance match.
 * Strong profiles → important stores. Weak profiles → secondary stores.
 */
export function scoreStoreImportanceMatch(
  reliabilityScore: number | null,
  storeImportance: number,
): number {
  const score = reliabilityScore ?? 50;
  if (storeImportance === 1) return score >= 75 ? 1.0 : score >= 50 ? 0.5 : 0.1;
  if (storeImportance === 3) return 0.7; // secondary stores: neutral-good for anyone
  return score / 100; // standard stores
}

/**
 * Combined weighted score for a candidate assignment.
 * Now includes Manager Brain dimensions when slotPhase and storeImportance are provided.
 */
export function calculateCandidateScore(
  employee: SolverEmployee,
  state: EmployeeState,
  shiftHours: number,
  storeId: string,
  minCost: number,
  maxCost: number,
  avgPoolHours: number,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  slotPhase?: SlotPhase,
  storeImportance?: number,
): number {
  const wTotal =
    weights.contractualTarget +
    weights.priorityBonus +
    weights.preferredStore +
    weights.costEfficiency +
    weights.fairDistribution +
    weights.reliabilityMatch +
    weights.storeImportanceMatch;

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

  // Manager Brain dimensions
  const phase = slotPhase ?? "MILIEU";
  const importance = storeImportance ?? 2;

  const s6 = scoreReliabilityMatch(
    employee.reliabilityScore,
    employee.profileCategory,
    phase,
    importance,
  );
  const s7 = scoreStoreImportanceMatch(
    employee.reliabilityScore,
    importance,
  );

  return (
    (s1 * weights.contractualTarget +
      s2 * weights.priorityBonus +
      s3 * weights.preferredStore +
      s4 * weights.costEfficiency +
      s5 * weights.fairDistribution +
      s6 * weights.reliabilityMatch +
      s7 * weights.storeImportanceMatch) /
    wTotal
  );
}

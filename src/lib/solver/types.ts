/**
 * Auto-Planning Solver Types
 *
 * All types are denormalized — the solver never accesses the database.
 * Data is pre-loaded by data-loader.ts and passed as SolverInput.
 */

// ─── Solver Input Types ─────────────────────────

export interface SolverUnavailability {
  type: "FIXED" | "VARIABLE";
  dayOfWeek: number | null; // 0=Dim, 1=Lun...6=Sam (FIXED only)
  date: string | null; // "YYYY-MM-DD" (VARIABLE only)
  startTime: string | null; // "HH:mm" or null = full day
  endTime: string | null;
}

export interface SolverEmployee {
  id: string;
  firstName: string;
  lastName: string;
  weeklyHours: number | null; // contractual target (e.g. 35h CDI)
  contractType: string | null;
  priority: number; // 1=high (CDI), 2=medium, 3=low (extra)
  maxHoursPerDay: number; // default 10
  maxHoursPerWeek: number; // default 48
  minRestBetween: number; // default 11h
  skills: string[];
  preferredStoreId: string | null;
  shiftPreference: "MATIN" | "APRES_MIDI" | "JOURNEE"; // shift time preference
  costPerHour: number | null; // pre-computed employer cost/hour
  unavailabilities: SolverUnavailability[];
  reliabilityScore: number | null; // 0-100 (Manager Brain)
  profileCategory: "A" | "B" | "C" | null; // derived from reliability score
}

export interface SolverStoreSchedule {
  dayOfWeek: number;
  closed: boolean;
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
  minEmployees: number; // resolved per-day or store default
  maxEmployees: number | null; // resolved per-day or store default (null = unlimited)
  maxSimultaneous: number | null; // resolved per-day or store default (null = use store default)
}

export interface SolverStore {
  id: string;
  name: string;
  minEmployees: number; // global default
  maxEmployees: number | null; // global default (null = unlimited)
  needsManager: boolean;
  allowOverlap: boolean;
  maxOverlapMinutes: number;
  maxSimultaneous: number; // default 1
  schedules: Map<number, SolverStoreSchedule>;
  importance: number; // 1=critique, 2=standard, 3=secondaire (Manager Brain)
}

export interface SolverExistingShift {
  id: string;
  employeeId: string | null;
  storeId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string;
  endTime: string;
}

// ─── Solver Working State ────────────────────────

export interface SolverShift {
  employeeId: string | null;
  storeId: string; // needed for multi-store constraint filtering
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
}

export interface DaySlot {
  date: string; // "YYYY-MM-DD"
  dayOfWeek: number; // 0-6
  schedule: SolverStoreSchedule;
}

export interface EmployeeState {
  weeklyHoursAssigned: number;
  dailyHours: Map<string, number>; // date → hours
  shifts: SolverShift[]; // all shifts (existing + generated)
}

export interface SolverOptions {
  mode: "preview" | "save";
  shiftDurationHours: number; // default shift length (e.g. 7 or 8)
  shiftGranularity: number; // minutes between slot starts (e.g. 30)
  idealShiftRange?: [number, number]; // optional ideal shift duration range (e.g. [4, 6])
}

export interface SolverInput {
  store: SolverStore;
  employees: SolverEmployee[];
  existingShifts: SolverExistingShift[];
  weekDays: DaySlot[]; // open days only (closed filtered out)
  options: SolverOptions;
}

// ─── Slot Phase (Manager Brain) ──────────────────

export type SlotPhase = "OUVERTURE" | "FERMETURE" | "MILIEU";

export interface ClassifiedSlot {
  startTime: string;
  endTime: string;
  hours: number;
  breakMinutes: number;
  label: string;
  phase: SlotPhase;
  storeId: string;
  storeImportance: number;
  date: string;
  dayOfWeek: number;
  priority: number; // lower = filled first
}

// ─── Solver Output ───────────────────────────────

export interface GeneratedShift {
  employeeId: string | null;
  employeeName: string;
  storeId: string;
  storeName: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  breakMinutes: number; // 30 if shift > 6h, 0 otherwise
  warnings: string[];
  assignmentReason: string | null; // Manager Brain: reason for this assignment
  slotPhase: SlotPhase; // Manager Brain: slot classification
}

export interface SolverResult {
  shifts: GeneratedShift[];
  warnings: string[];
  stats: {
    totalShiftsGenerated: number;
    assignedCount: number;
    unassignedCount: number;
    totalHoursGenerated: number;
    daysFullyCovered: number;
    daysPartiallyCovered: number;
    daysUncovered: number;
    employeesUsed: number;
    solveTimeMs: number;
  };
}

// ─── Scenario Types ─────────────────────────────

export interface ScenarioConfig {
  durationsToTry: number[]; // e.g. [4, 5, 6, 7, 8]
  maxScenarios: number; // cap, default 12
  idealShiftHours: [number, number]; // e.g. [4, 6]
  acceptableShiftHours: [number, number]; // e.g. [6, 8]
}

export const DEFAULT_SCENARIO_CONFIG: ScenarioConfig = {
  durationsToTry: [4, 5, 6, 7, 8],
  maxScenarios: 12,
  idealShiftHours: [4, 6],
  acceptableShiftHours: [3, 9],
};

export interface ScenarioScoreBreakdown {
  coverageCompleteness: number; // 0-100
  shiftDurationQuality: number; // 0-100
  employeeBalance: number; // 0-100
  constraintRespect: number; // 0-100
  costEfficiency: number; // 0-100
  breakQuality: number; // 0-100
  profilePlacementQuality: number; // 0-100 (Manager Brain)
}

export interface ScenarioScore {
  total: number; // 0-100 weighted composite
  breakdown: ScenarioScoreBreakdown;
  label: string; // "Excellent" | "Bon" | "Acceptable" | "Insuffisant"
}

export interface ScoredScenario {
  id: string; // e.g. "scenario-dur5-balanced"
  params: {
    shiftDurationHours: number;
    scoringProfile: string;
    assignmentOrder: string;
  };
  result: SolverResult;
  score: ScenarioScore;
}

export interface CrossStoreSuggestion {
  type: "MOVE_EMPLOYEE" | "SWAP_EMPLOYEES" | "ADD_COVERAGE";
  employeeId: string;
  employeeName: string;
  fromStoreId: string;
  fromStoreName: string;
  toStoreId: string;
  toStoreName: string;
  date: string;
  reason: string;
  impact: string;
}

export interface ScenarioResult {
  best: ScoredScenario;
  alternatives: ScoredScenario[]; // top 3
  suggestions: CrossStoreSuggestion[];
  totalScenariosEvaluated: number;
  totalTimeMs: number;
}

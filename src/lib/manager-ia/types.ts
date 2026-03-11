/**
 * Manager IA — Types partagés entre les 4 couches
 *
 * Pipeline: Parser → Resolver → Planner → Executor
 */

// ─── Action Types ────────────────────────────────

export type ActionType =
  | "CREATE"
  | "MOVE"
  | "DELETE"
  | "SHORTEN"
  | "EXTEND"
  | "ADD_BREAK"
  | "FILL_GAPS"
  | "OPTIMIZE_DAY"
  | "OPTIMIZE_WEEK"
  // ─── Conversational queries ───
  | "QUERY_AVAILABLE"      // "Qui peut couvrir vendredi soir ?"
  | "FIND_REPLACEMENT"     // "Trouve un remplaçant pour Yassin"
  | "QUERY_SCHEDULE"       // "Qui travaille demain ?"
  | "QUERY_HOURS"          // "Combien d'heures a Zakaria ?"
  | "ANALYZE"              // "Quels problèmes ?" / "Analyse le planning"
  | "QUERY_SCORE";         // "Quel est le score du planning ?"

// ─── Layer 1: Parser Output ─────────────────────

export interface ParsedIntent {
  action: ActionType;
  employeeName: string | null;
  storeName: string | null;
  dateExpr: string | null;        // "demain", "mardi", "15 mars"
  targetDateExpr: string | null;  // for MOVE: target day
  timeSlot: string | null;        // "matin", "après-midi", "de 9h à 17h"
  startTimeExpr: string | null;   // explicit start: "9h", "10h00"
  endTimeExpr: string | null;     // explicit end: "17h", "18h00"
  duration: number | null;        // in minutes (e.g. 60 for "1h")
  rawCommand: string;
}

// ─── Layer 2: Resolver Output ───────────────────

export interface ResolvedEmployee {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ResolvedStore {
  id: string;
  name: string;
}

export interface ResolvedShift {
  id: string;
  employeeId: string | null;
  storeId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ResolvedCommand {
  action: ActionType;
  employee: ResolvedEmployee | null;
  store: ResolvedStore | null;
  date: string | null;           // "YYYY-MM-DD"
  targetDate: string | null;     // for MOVE
  startTime: string | null;      // "HH:mm"
  endTime: string | null;        // "HH:mm"
  duration: number | null;       // minutes
  shift: ResolvedShift | null;   // existing shift (for MOVE/DELETE/SHORTEN/EXTEND/ADD_BREAK)
  errors: string[];              // resolution errors
}

// ─── Layer 3: Planner Output ────────────────────

export interface ProposalAction {
  type: "create" | "update" | "delete";
  shiftId?: string;              // for update/delete
  storeId: string;
  storeName: string;
  employeeId: string | null;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  explanation: string;           // human-readable explanation in French
}

export interface Alternative {
  description: string;
  actions: ProposalAction[];
}

// ─── Query Results (conversational mode) ────────

export interface AvailableEmployee {
  id: string;
  firstName: string;
  lastName: string;
  reason: string;                // "Disponible, 28h/35h cette semaine"
}

export interface PlanningIssue {
  severity: "critical" | "warning" | "info";
  category: string;              // "coverage" | "overtime" | "break" | "rest" | "unassigned"
  message: string;
  date?: string;
  storeName?: string;
  employeeName?: string;
}

export interface PlanningScore {
  total: number;                 // 0-100
  label: string;                 // "Excellent" | "Bon" | "Acceptable" | "Insuffisant"
  breakdown: {
    coverage: number;            // 0-100
    hoursBalance: number;        // 0-100
    breaksRespected: number;     // 0-100
    restRespected: number;       // 0-100
    unassignedPenalty: number;   // 0-100
  };
}

export interface EmployeeScheduleEntry {
  date: string;
  startTime: string;
  endTime: string;
  storeName: string;
  hours: number;
}

export interface QueryResult {
  type: "available" | "schedule" | "hours" | "analysis" | "score" | "replacement";
  availableEmployees?: AvailableEmployee[];
  schedule?: EmployeeScheduleEntry[];
  totalHours?: number;
  contractHours?: number | null;
  issues?: PlanningIssue[];
  score?: PlanningScore;
}

export interface Proposal {
  actions: ProposalAction[];
  warnings: string[];
  alternatives: Alternative[];
  explanation: string;           // summary of what will happen
  parsedIntent: ParsedIntent;
  resolvedCommand: ResolvedCommand;
  queryResult?: QueryResult;     // conversational mode results
}

// ─── Layer 4: Executor Output ───────────────────

export interface ExecutionResult {
  success: boolean;
  applied: number;
  errors: string[];
}

// ─── API Types ──────────────────────────────────

export interface ManagerIARequest {
  command: string;
  weekStart: string;
  storeId?: string;
  execute?: boolean;
}

export interface ManagerIAResponse {
  proposal: Proposal;
  result?: ExecutionResult;       // only when execute=true
}

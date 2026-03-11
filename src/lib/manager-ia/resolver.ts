/**
 * Manager IA — Layer 2: Resolver
 *
 * Résout les entités extraites par le Parser en données concrètes (IDs, dates, heures).
 */

import type {
  ParsedIntent,
  ResolvedCommand,
  ResolvedEmployee,
  ResolvedStore,
  ResolvedShift,
} from "./types";
import { fuzzyMatch } from "./parser";

// ─── Input Types ────────────────────────────────

export interface ResolverContext {
  employees: {
    id: string;
    firstName: string;
    lastName: string;
    stores: { storeId: string }[];
  }[];
  stores: {
    id: string;
    name: string;
    schedules: {
      dayOfWeek: number;
      closed: boolean;
      openTime: string | null;
      closeTime: string | null;
    }[];
  }[];
  existingShifts: {
    id: string;
    employeeId: string | null;
    storeId: string;
    date: string; // "YYYY-MM-DD"
    startTime: string;
    endTime: string;
  }[];
  weekStart: string; // "YYYY-MM-DD" (Monday)
  today: string;     // "YYYY-MM-DD"
}

// ─── Resolve Employee ───────────────────────────

function resolveEmployee(
  name: string | null,
  employees: ResolverContext["employees"]
): { employee: ResolvedEmployee | null; error: string | null } {
  if (!name) return { employee: null, error: null };

  const normalizedName = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Try exact first name match
  for (const emp of employees) {
    const fn = emp.firstName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const ln = emp.lastName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const full = `${fn} ${ln}`;

    if (fn === normalizedName || ln === normalizedName || full === normalizedName) {
      return {
        employee: { id: emp.id, firstName: emp.firstName, lastName: emp.lastName },
        error: null,
      };
    }
  }

  // Try fuzzy match on first names
  const firstNames = employees.map((e) => e.firstName);
  const fuzzyFirst = fuzzyMatch(name, firstNames, 2);
  if (fuzzyFirst) {
    const emp = employees.find((e) => e.firstName === fuzzyFirst)!;
    return {
      employee: { id: emp.id, firstName: emp.firstName, lastName: emp.lastName },
      error: null,
    };
  }

  // Try fuzzy match on last names
  const lastNames = employees.map((e) => e.lastName);
  const fuzzyLast = fuzzyMatch(name, lastNames, 2);
  if (fuzzyLast) {
    const emp = employees.find((e) => e.lastName === fuzzyLast)!;
    return {
      employee: { id: emp.id, firstName: emp.firstName, lastName: emp.lastName },
      error: null,
    };
  }

  // Try fuzzy match on full names
  const fullNames = employees.map((e) => `${e.firstName} ${e.lastName}`);
  const fuzzyFull = fuzzyMatch(name, fullNames, 3);
  if (fuzzyFull) {
    const emp = employees.find((e) => `${e.firstName} ${e.lastName}` === fuzzyFull)!;
    return {
      employee: { id: emp.id, firstName: emp.firstName, lastName: emp.lastName },
      error: null,
    };
  }

  return {
    employee: null,
    error: `Employé "${name}" non trouvé. Employés disponibles : ${employees.map((e) => e.firstName).join(", ")}`,
  };
}

// ─── Resolve Store ──────────────────────────────

function resolveStore(
  name: string | null,
  stores: ResolverContext["stores"]
): { store: ResolvedStore | null; error: string | null } {
  if (!name) return { store: null, error: null };

  const normalizedName = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Exact match
  for (const s of stores) {
    const sn = s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (sn === normalizedName || sn.includes(normalizedName) || normalizedName.includes(sn)) {
      return { store: { id: s.id, name: s.name }, error: null };
    }
  }

  // Fuzzy match
  const storeNames = stores.map((s) => s.name);
  const fuzzyResult = fuzzyMatch(name, storeNames, 3);
  if (fuzzyResult) {
    const s = stores.find((st) => st.name === fuzzyResult)!;
    return { store: { id: s.id, name: s.name }, error: null };
  }

  return {
    store: null,
    error: `Magasin "${name}" non trouvé. Magasins disponibles : ${stores.map((s) => s.name).join(", ")}`,
  };
}

// ─── Resolve Date ───────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3,
  mai: 4, juin: 5, juillet: 6, août: 7, aout: 7,
  septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11,
};

function resolveDate(
  dateExpr: string | null,
  weekStart: string,
  today: string
): string | null {
  if (!dateExpr) return null;

  const todayDate = parseDate(today);

  // Relative dates
  if (dateExpr === "today") {
    return today;
  }
  if (dateExpr === "tomorrow") {
    const d = new Date(todayDate);
    d.setUTCDate(d.getUTCDate() + 1);
    return formatDateStr(d);
  }
  if (dateExpr === "day_after_tomorrow") {
    const d = new Date(todayDate);
    d.setUTCDate(d.getUTCDate() + 2);
    return formatDateStr(d);
  }

  // Weekday: "weekday:1" (Monday)
  if (dateExpr.startsWith("weekday:")) {
    const targetDay = parseInt(dateExpr.split(":")[1]);
    const ws = parseDate(weekStart);
    // weekStart is Monday (day 1)
    // Calculate offset: Monday=0, Tuesday=1, ..., Sunday=6
    const dayMap: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
    const offset = dayMap[targetDay] ?? 0;
    const d = new Date(ws);
    d.setUTCDate(ws.getUTCDate() + offset);
    return formatDateStr(d);
  }

  // Day of month: "day:15"
  if (dateExpr.startsWith("day:")) {
    const dayNum = parseInt(dateExpr.split(":")[1]);
    const d = new Date(todayDate);
    d.setUTCDate(dayNum);
    // If the day is in the past this month, go to next month
    if (d < todayDate) {
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return formatDateStr(d);
  }

  // "15 mars" format
  const monthMatch = dateExpr.match(/(\d{1,2})\s+(\w+)/);
  if (monthMatch) {
    const day = parseInt(monthMatch[1]);
    const monthName = monthMatch[2].toLowerCase();
    const month = MONTH_NAMES[monthName];
    if (month !== undefined) {
      const year = todayDate.getUTCFullYear();
      const d = new Date(Date.UTC(year, month, day));
      if (d < todayDate) {
        d.setUTCFullYear(year + 1);
      }
      return formatDateStr(d);
    }
  }

  return null;
}

// ─── Resolve Time Slot ──────────────────────────

function resolveTimeSlot(
  timeSlot: string | null,
  startTimeExpr: string | null,
  endTimeExpr: string | null,
  storeSchedule?: { openTime: string | null; closeTime: string | null }
): { startTime: string | null; endTime: string | null } {
  // Explicit times take priority
  if (startTimeExpr && endTimeExpr) {
    return { startTime: startTimeExpr, endTime: endTimeExpr };
  }

  const openTime = storeSchedule?.openTime || "08:00";
  const closeTime = storeSchedule?.closeTime || "20:00";

  // Calculate midpoint
  const openMin = timeToMin(openTime);
  const closeMin = timeToMin(closeTime);
  const midpoint = Math.floor((openMin + closeMin) / 2);
  const midTime = minToTime(midpoint);

  if (timeSlot === "matin") {
    return {
      startTime: startTimeExpr || openTime,
      endTime: endTimeExpr || midTime,
    };
  }
  if (timeSlot === "apres-midi") {
    return {
      startTime: startTimeExpr || midTime,
      endTime: endTimeExpr || closeTime,
    };
  }
  if (timeSlot === "soir") {
    return {
      startTime: startTimeExpr || "18:00",
      endTime: endTimeExpr || closeTime,
    };
  }
  if (timeSlot === "journee") {
    return {
      startTime: startTimeExpr || openTime,
      endTime: endTimeExpr || closeTime,
    };
  }

  // If only one explicit time
  if (startTimeExpr) {
    return { startTime: startTimeExpr, endTime: endTimeExpr };
  }
  if (endTimeExpr) {
    return { startTime: startTimeExpr, endTime: endTimeExpr };
  }

  return { startTime: null, endTime: null };
}

// ─── Find Existing Shift ────────────────────────

function findExistingShift(
  employeeId: string | null,
  date: string | null,
  shifts: ResolverContext["existingShifts"]
): ResolvedShift | null {
  if (!employeeId || !date) return null;

  const normalizedDate = date.split("T")[0];

  const match = shifts.find(
    (s) => s.employeeId === employeeId && s.date.split("T")[0] === normalizedDate
  );

  if (!match) return null;

  return {
    id: match.id,
    employeeId: match.employeeId,
    storeId: match.storeId,
    date: match.date.split("T")[0],
    startTime: match.startTime,
    endTime: match.endTime,
  };
}

// ─── Helpers ────────────────────────────────────

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function timeToMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// ─── Main Resolve Function ──────────────────────

export function resolveCommand(
  intent: ParsedIntent,
  context: ResolverContext
): ResolvedCommand {
  const errors: string[] = [];

  // 1. Resolve employee
  const { employee, error: empError } = resolveEmployee(
    intent.employeeName,
    context.employees
  );
  if (empError) errors.push(empError);

  // 2. Resolve store
  const { store, error: storeError } = resolveStore(
    intent.storeName,
    context.stores
  );
  if (storeError) errors.push(storeError);

  // For actions that require an employee, error if not found
  const needsEmployee = ["CREATE", "MOVE", "DELETE", "SHORTEN", "EXTEND", "ADD_BREAK"];
  if (needsEmployee.includes(intent.action) && !employee && !empError) {
    errors.push("Aucun employé spécifié dans la commande.");
  }

  // 3. Resolve date
  const date = resolveDate(intent.dateExpr, context.weekStart, context.today);
  const targetDate = resolveDate(intent.targetDateExpr, context.weekStart, context.today);

  if (!date && !["OPTIMIZE_WEEK"].includes(intent.action)) {
    // For most actions, we need a date. Default to today for some.
    if (intent.action === "CREATE" && !intent.dateExpr) {
      errors.push("Aucune date spécifiée. Précisez un jour (ex: demain, mardi, le 15).");
    }
  }

  // 4. Resolve time slot
  // Find store schedule for the target date
  let storeSchedule: { openTime: string | null; closeTime: string | null } | undefined;
  const resolvedStoreId = store?.id;
  if (resolvedStoreId && date) {
    const d = parseDate(date);
    const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon...6=Sat
    const storeData = context.stores.find((s) => s.id === resolvedStoreId);
    const schedule = storeData?.schedules.find((s) => s.dayOfWeek === dayOfWeek);
    if (schedule && !schedule.closed) {
      storeSchedule = { openTime: schedule.openTime, closeTime: schedule.closeTime };
    }
  }

  const { startTime, endTime } = resolveTimeSlot(
    intent.timeSlot,
    intent.startTimeExpr,
    intent.endTimeExpr,
    storeSchedule
  );

  // 5. Find existing shift (for MOVE/DELETE/SHORTEN/EXTEND/ADD_BREAK)
  const needsShift = ["MOVE", "DELETE", "SHORTEN", "EXTEND", "ADD_BREAK"];
  let shift: ResolvedShift | null = null;
  if (needsShift.includes(intent.action) && employee && date) {
    shift = findExistingShift(employee.id, date, context.existingShifts);
    if (!shift) {
      errors.push(
        `Aucun shift trouvé pour ${employee.firstName} ${employee.lastName} le ${date}.`
      );
    }
  }

  return {
    action: intent.action,
    employee,
    store,
    date,
    targetDate,
    startTime,
    endTime,
    duration: intent.duration,
    shift,
    errors,
  };
}

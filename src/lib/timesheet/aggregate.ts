/**
 * Timesheet — couche d'agrégation métier.
 *
 * À PARTIR DES DONNÉES BRUTES (Shifts + ClockIns + Absences), produit la
 * structure de réponse business : totals + rows (selon groupBy) + anomalies
 * optionnelles.
 *
 * Aucun appel Prisma, aucun fetch, aucun NextAuth, aucun NextResponse.
 * Pure transformation : input → output. Testable en isolation.
 *
 * Séparation des étages :
 *   - calc.ts       = math pure (durées, semaines, coûts)
 *   - query.ts      = lecture Prisma (read-only fetchers)
 *   - aggregate.ts  = transformation métier (CE FICHIER)
 *   - route.ts      = HTTP/RBAC/Zod orchestration
 */

import {
  computeShiftMinutes,
  estimateBreakMinutes,
  computeWorkedMinutes,
  daysOverlap,
  getISOWeekStart,
  overtimeForWeek,
  estimateGrossCost,
} from "./calc";
import type {
  TimesheetShift,
  TimesheetClockIn,
  TimesheetAbsence,
  EmployeeContext,
  StoreContext,
} from "./query";

// ─── Types publics ──────────────────────────────────────────────────────────

export type GroupBy = "employee" | "store" | "day" | "week";

export type Totals = {
  plannedMinutes: number;
  unassignedPlannedMinutes: number;
  workedMinutes: number;
  inProgressMinutes: number;
  breakMinutesEstimated: number;
  netWorkedMinutes: number;
  varianceMinutes: number;
  lateMinutesTotal: number;
  absencesDays: number;
  overtimeMinutes: number;
  estimatedGrossCost: number | null;
};

export type EmployeeRow = Totals & {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  contractType: string | null;
  weeklyHours: number | null;
  hourlyRateGross: number | null;
  shiftsCount: number;
  clockInsCount: number;
  absencesCount: number;
};

export type StoreRow = Totals & {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  shiftsCount: number;
  clockInsCount: number;
};

export type DayRow = Totals & {
  date: string;
  shiftsCount: number;
  clockInsCount: number;
};

export type WeekRow = Totals & {
  weekStart: string;
  weekEnd: string;
  shiftsCount: number;
  clockInsCount: number;
};

export type AnyRow = EmployeeRow | StoreRow | DayRow | WeekRow;

export type AnomalyType =
  | "CLOCKIN_NOT_CLOSED"
  | "SHIFT_WITHOUT_CLOCKIN"
  | "CLOCKIN_WITHOUT_SHIFT"
  | "LATE";

export type Anomaly = {
  type: AnomalyType;
  severity: "INFO" | "WARNING" | "CRITICAL";
  date: string;
  employeeId: string | null;
  shiftId: string | null;
  clockInId: string | null;
  message: string;
};

export type BuildResponseInput = {
  shifts: TimesheetShift[];
  clockIns: TimesheetClockIn[];
  absences: TimesheetAbsence[];
  employeesMap: Map<string, EmployeeContext>;
  storesMap: Map<string, StoreContext>;
  dateFrom: Date;
  dateTo: Date;
  groupBy: GroupBy;
  /** Si true, masque hourlyRateGross + estimatedGrossCost (rôle EMPLOYEE). */
  hideMoneyFields: boolean;
  includeAnomalies: boolean;
  /** Pour les anomalies CLOCKIN_NOT_CLOSED : caller passe Date.now() (testable). */
  now?: Date;
};

export type BuildResponseOutput = {
  totals: Totals;
  rows: AnyRow[];
  /** Toujours retourné, même si 0 — exposé séparément dans totals.unassignedPlannedMinutes par le caller. */
  unassignedPlannedMinutes: number;
  anomalies?: Anomaly[];
};

// ─── Helpers internes ───────────────────────────────────────────────────────

type Bucket = {
  totals: Totals;
  shiftsCount: number;
  clockInsCount: number;
  absencesCount: number;
  /** Pour overtime hebdo : weekStart ISO → workedMinutes cumul de la semaine. */
  weeklyWorked: Map<string, number>;
  /** Cache du hourlyRate de l'employé pour estimateGrossCost (groupBy=employee). */
  hourlyRateGross: number | null;
};

function emptyTotals(): Totals {
  return {
    plannedMinutes: 0,
    unassignedPlannedMinutes: 0,
    workedMinutes: 0,
    inProgressMinutes: 0,
    breakMinutesEstimated: 0,
    netWorkedMinutes: 0,
    varianceMinutes: 0,
    lateMinutesTotal: 0,
    absencesDays: 0,
    overtimeMinutes: 0,
    estimatedGrossCost: null,
  };
}

function emptyBucket(): Bucket {
  return {
    totals: emptyTotals(),
    shiftsCount: 0,
    clockInsCount: 0,
    absencesCount: 0,
    weeklyWorked: new Map(),
    hourlyRateGross: null,
  };
}

function dateOnlyISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function bucketKeyForShift(s: TimesheetShift, groupBy: GroupBy): string | null {
  if (groupBy === "employee") return s.employeeId; // null géré par caller
  if (groupBy === "store") return s.storeId;
  if (groupBy === "day") return dateOnlyISO(s.date);
  if (groupBy === "week") return dateOnlyISO(getISOWeekStart(s.date));
  return null;
}

function bucketKeyForClockIn(
  c: TimesheetClockIn,
  groupBy: GroupBy,
): string | null {
  if (groupBy === "employee") return c.employeeId;
  if (groupBy === "store") return c.storeId;
  if (groupBy === "day") return dateOnlyISO(c.clockInAt);
  if (groupBy === "week") return dateOnlyISO(getISOWeekStart(c.clockInAt));
  return null;
}

// ─── Détection anomalies ────────────────────────────────────────────────────

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function detectAnomalies(
  shifts: TimesheetShift[],
  clockIns: TimesheetClockIn[],
  now: Date,
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const nowMs = now.getTime();

  // CLOCKIN_NOT_CLOSED : pointage ouvert depuis plus de 24h
  for (const c of clockIns) {
    if (c.clockOutAt === null && nowMs - c.clockInAt.getTime() > TWENTY_FOUR_HOURS_MS) {
      anomalies.push({
        type: "CLOCKIN_NOT_CLOSED",
        severity: "CRITICAL",
        date: dateOnlyISO(c.clockInAt),
        employeeId: c.employeeId,
        shiftId: c.shiftId,
        clockInId: c.id,
        message: "Pointage ouvert depuis plus de 24h",
      });
    }
  }

  // CLOCKIN_WITHOUT_SHIFT : pointage sans shift lié
  for (const c of clockIns) {
    if (!c.shiftId) {
      anomalies.push({
        type: "CLOCKIN_WITHOUT_SHIFT",
        severity: "INFO",
        date: dateOnlyISO(c.clockInAt),
        employeeId: c.employeeId,
        shiftId: null,
        clockInId: c.id,
        message: "Pointage sans shift lié",
      });
    }
  }

  // SHIFT_WITHOUT_CLOCKIN : shifts passés sans pointage
  const today = new Date(now.getTime());
  today.setUTCHours(0, 0, 0, 0);
  const shiftsWithClockIns = new Set<string>(
    clockIns.filter((c) => c.shiftId).map((c) => c.shiftId!),
  );
  for (const s of shifts) {
    if (s.date < today && s.employeeId && !shiftsWithClockIns.has(s.id)) {
      anomalies.push({
        type: "SHIFT_WITHOUT_CLOCKIN",
        severity: "WARNING",
        date: dateOnlyISO(s.date),
        employeeId: s.employeeId,
        shiftId: s.id,
        clockInId: null,
        message: "Shift passé sans pointage",
      });
    }
  }

  // LATE : pointage en retard
  for (const c of clockIns) {
    if (c.lateMinutes > 0) {
      anomalies.push({
        type: "LATE",
        severity: "INFO",
        date: dateOnlyISO(c.clockInAt),
        employeeId: c.employeeId,
        shiftId: c.shiftId,
        clockInId: c.id,
        message: `Retard de ${c.lateMinutes} min`,
      });
    }
  }

  return anomalies;
}

// ─── Fonction principale ────────────────────────────────────────────────────

/**
 * Transforme données brutes → réponse business agrégée.
 *
 * Comportement par groupBy :
 *   - employee : 1 row par employé ; shifts sans employeeId comptés dans
 *                `unassignedPlannedMinutes` séparé (cf. ajustement plan A).
 *   - store    : 1 row par magasin ; shifts sans employeeId restent inclus
 *                car ils ont un storeId.
 *   - day      : 1 row par date.
 *   - week     : 1 row par lundi ISO 8601.
 *
 * `hideMoneyFields=true` (rôle EMPLOYEE) → tous les `hourlyRateGross` et
 * `estimatedGrossCost` retournés à null, y compris dans `totals`.
 */
export function buildTimesheetResponse(
  input: BuildResponseInput,
): BuildResponseOutput {
  const {
    shifts,
    clockIns,
    absences,
    employeesMap,
    storesMap,
    dateFrom,
    dateTo,
    groupBy,
    hideMoneyFields,
    includeAnomalies,
    now = new Date(),
  } = input;

  const buckets = new Map<string, Bucket>();
  let unassignedPlannedMinutes = 0;

  function getOrCreate(key: string): Bucket {
    let b = buckets.get(key);
    if (!b) {
      b = emptyBucket();
      buckets.set(key, b);
    }
    return b;
  }

  // ─── 1. Shifts → planned + break ──────────────────────────────────────
  for (const s of shifts) {
    const planned = computeShiftMinutes(s.startTime, s.endTime);
    const breakEst = estimateBreakMinutes(planned);

    // Ajustement A : shifts sans employee exclus des rows en groupBy=employee
    if (groupBy === "employee" && !s.employeeId) {
      unassignedPlannedMinutes += planned;
      continue;
    }

    const key = bucketKeyForShift(s, groupBy);
    if (!key) continue;
    const b = getOrCreate(key);
    b.totals.plannedMinutes += planned;
    b.totals.breakMinutesEstimated += breakEst;
    b.shiftsCount += 1;
  }

  // ─── 2. ClockIns → worked + late ──────────────────────────────────────
  for (const c of clockIns) {
    const wr = computeWorkedMinutes(c.clockInAt, c.clockOutAt);
    const key = bucketKeyForClockIn(c, groupBy);
    if (!key) continue;
    const b = getOrCreate(key);
    b.totals.workedMinutes += wr.worked;
    b.totals.lateMinutesTotal += c.lateMinutes;
    b.clockInsCount += 1;
    // V1 : inProgressMinutes pas calculé en durée (signalé via anomalies)

    if (groupBy === "employee") {
      const weekKey = dateOnlyISO(getISOWeekStart(c.clockInAt));
      b.weeklyWorked.set(
        weekKey,
        (b.weeklyWorked.get(weekKey) ?? 0) + wr.worked,
      );
    }
  }

  // ─── 3. Absences → daysOverlap (groupBy=employee seulement) ────────────
  if (groupBy === "employee") {
    for (const a of absences) {
      const b = getOrCreate(a.employeeId);
      const overlap = daysOverlap(dateFrom, dateTo, a.startDate, a.endDate);
      b.totals.absencesDays += overlap;
      b.absencesCount += 1;
    }
  }

  // ─── 4. Finalisation par bucket : netWorked, variance, overtime, cost ─
  for (const [key, b] of buckets.entries()) {
    b.totals.netWorkedMinutes =
      b.totals.workedMinutes - b.totals.breakMinutesEstimated;
    b.totals.varianceMinutes =
      b.totals.netWorkedMinutes - b.totals.plannedMinutes;

    if (groupBy === "employee") {
      const emp = employeesMap.get(key);
      const weeklyHours = emp?.weeklyHours ?? null;
      let overtimeTotal = 0;
      for (const workedThisWeek of b.weeklyWorked.values()) {
        overtimeTotal += overtimeForWeek(workedThisWeek, weeklyHours);
      }
      b.totals.overtimeMinutes = overtimeTotal;
      b.hourlyRateGross = emp?.hourlyRateGross ?? null;
    } else {
      // groupBy=store/day/week : pas de notion d'employé unique → overtime non pertinent
      b.totals.overtimeMinutes = 0;
    }

    b.totals.estimatedGrossCost = hideMoneyFields
      ? null
      : estimateGrossCost(b.totals.workedMinutes, b.hourlyRateGross);
  }

  // ─── 5. Construction des rows ──────────────────────────────────────────
  let rows: AnyRow[];

  if (groupBy === "employee") {
    rows = [...buckets.entries()].map(([empId, b]) => {
      const emp = employeesMap.get(empId);
      const row: EmployeeRow = {
        ...b.totals,
        employeeId: empId,
        employeeCode: emp?.employeeCode ?? "",
        firstName: emp?.firstName ?? "",
        lastName: emp?.lastName ?? "",
        contractType: emp?.contractType ?? null,
        weeklyHours: emp?.weeklyHours ?? null,
        hourlyRateGross: hideMoneyFields ? null : (emp?.hourlyRateGross ?? null),
        shiftsCount: b.shiftsCount,
        clockInsCount: b.clockInsCount,
        absencesCount: b.absencesCount,
      };
      return row;
    });
    rows.sort((a, b) =>
      (a as EmployeeRow).lastName.localeCompare((b as EmployeeRow).lastName),
    );
  } else if (groupBy === "store") {
    rows = [...buckets.entries()].map(([storeIdKey, b]) => {
      const store = storesMap.get(storeIdKey);
      const row: StoreRow = {
        ...b.totals,
        storeId: storeIdKey,
        storeName: store?.name ?? "",
        storeCode: store?.storeCode ?? null,
        shiftsCount: b.shiftsCount,
        clockInsCount: b.clockInsCount,
      };
      return row;
    });
    rows.sort((a, b) =>
      (a as StoreRow).storeName.localeCompare((b as StoreRow).storeName),
    );
  } else if (groupBy === "day") {
    rows = [...buckets.entries()].map(([dateKey, b]) => {
      const row: DayRow = {
        ...b.totals,
        date: dateKey,
        shiftsCount: b.shiftsCount,
        clockInsCount: b.clockInsCount,
      };
      return row;
    });
    rows.sort((a, b) => (a as DayRow).date.localeCompare((b as DayRow).date));
  } else {
    rows = [...buckets.entries()].map(([weekStartKey, b]) => {
      const start = new Date(weekStartKey + "T00:00:00Z");
      const end = new Date(start.getTime());
      end.setUTCDate(end.getUTCDate() + 6);
      const row: WeekRow = {
        ...b.totals,
        weekStart: weekStartKey,
        weekEnd: dateOnlyISO(end),
        shiftsCount: b.shiftsCount,
        clockInsCount: b.clockInsCount,
      };
      return row;
    });
    rows.sort((a, b) =>
      (a as WeekRow).weekStart.localeCompare((b as WeekRow).weekStart),
    );
  }

  // ─── 6. Totals globaux ─────────────────────────────────────────────────
  const totals = emptyTotals();
  totals.unassignedPlannedMinutes = unassignedPlannedMinutes;
  let estimatedCostNullable: number | null = hideMoneyFields ? null : 0;
  for (const b of buckets.values()) {
    totals.plannedMinutes += b.totals.plannedMinutes;
    totals.workedMinutes += b.totals.workedMinutes;
    totals.inProgressMinutes += b.totals.inProgressMinutes;
    totals.breakMinutesEstimated += b.totals.breakMinutesEstimated;
    totals.lateMinutesTotal += b.totals.lateMinutesTotal;
    totals.absencesDays += b.totals.absencesDays;
    totals.overtimeMinutes += b.totals.overtimeMinutes;
    if (!hideMoneyFields && b.totals.estimatedGrossCost !== null) {
      estimatedCostNullable =
        (estimatedCostNullable ?? 0) + b.totals.estimatedGrossCost;
    }
  }
  totals.netWorkedMinutes = totals.workedMinutes - totals.breakMinutesEstimated;
  totals.varianceMinutes = totals.netWorkedMinutes - totals.plannedMinutes;
  totals.estimatedGrossCost = hideMoneyFields
    ? null
    : estimatedCostNullable !== null
      ? Math.round(estimatedCostNullable * 100) / 100
      : null;

  // ─── 7. Anomalies (si demandées) ───────────────────────────────────────
  const anomalies = includeAnomalies
    ? detectAnomalies(shifts, clockIns, now)
    : undefined;

  return {
    totals,
    rows,
    unassignedPlannedMinutes,
    ...(anomalies ? { anomalies } : {}),
  };
}

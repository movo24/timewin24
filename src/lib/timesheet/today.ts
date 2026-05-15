/**
 * Timesheet — vue "Aujourd'hui Manager".
 *
 * Logique métier spécifique pour `/api/timesheet/today`.
 * Aucun appel Prisma ici (pure transformation), aucune dépendance NextAuth.
 *
 * Distinction vs aggregate.ts :
 *   - aggregate.ts = timesheet sur une période, par groupBy
 *   - today.ts     = snapshot intra-jour, orienté KPIs présence + alertes actionables
 *
 * Limites V1 (documentées) :
 *   - Timezone : la fenêtre "aujourd'hui" est UTC. Pour les boutiques en
 *     dehors d'Europe/Paris, ça peut créer un décalage (jusqu'à ±2h).
 *     V2 devra utiliser Store.timezone par magasin.
 *   - CLOCKIN_NOT_CLOSED : seuil V1 = 12h depuis clockInAt. Les pointages
 *     ouverts de la veille ne sont PAS fetchés (route.ts limite à today),
 *     donc l'alerte ne se déclenche que sur les pointages anormalement
 *     longs commencés tôt le matin (ex: clockIn 06h, encore ouvert 18h+).
 *     V2 : fetch yesterday's open clock-ins aussi pour catch "oublié hier".
 */

import type {
  TimesheetShift,
  TimesheetClockIn,
  TimesheetAbsence,
  EmployeeContext,
  StoreContext,
} from "./query";
import { computeShiftMinutes, computeWorkedMinutes } from "./calc";

// ─── Types publics ──────────────────────────────────────────────────────────

export type TodaySummary = {
  storesActive: number;
  shiftsPlanned: number;
  shiftsCovered: number;
  shiftsUncovered: number;
  clockInsTotal: number;
  clockInsOpen: number;
  plannedMinutes: number;
  workedMinutes: number;
  inProgressMinutes: number;
  lateMinutesTotal: number;
  /** Ratio shiftsCovered / shiftsPlanned (0..1). 0 si shiftsPlanned=0. */
  coverageRate: number;
  /** Employés en AbsenceDeclaration APPROVED chevauchant aujourd'hui. */
  absencesApproved: number;
};

export type StoreToday = {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  shiftsPlanned: number;
  shiftsCovered: number;
  clockInsOpen: number;
  plannedMinutes: number;
  workedMinutes: number;
  lateCount: number;
  /**
   * Employés actuellement présents (ClockIn ouvert).
   * Champs limités : pas d'email, GPS, photo (PII non nécessaire UI).
   */
  presentNow: {
    employeeId: string;
    firstName: string;
    lastName: string;
  }[];
};

export type TodayAlert = {
  type: "CLOCKIN_NOT_CLOSED" | "LATE";
  severity: "CRITICAL" | "INFO";
  employeeId: string;
  storeId: string;
  shiftId: string | null;
  clockInId: string;
  message: string;
};

export type BuildTodayInput = {
  shifts: TimesheetShift[];
  clockIns: TimesheetClockIn[];
  /** AbsenceDeclaration APPROVED chevauchant aujourd'hui. */
  absences: TimesheetAbsence[];
  employeesMap: Map<string, EmployeeContext>;
  storesMap: Map<string, StoreContext>;
  /** Date.now() injectable pour testabilité. */
  now?: Date;
};

export type BuildTodayOutput = {
  summary: TodaySummary;
  stores: StoreToday[];
  alerts: TodayAlert[];
};

// ─── Constantes ─────────────────────────────────────────────────────────────

/** Seuil V1 d'alerte CLOCKIN_NOT_CLOSED en ms (12h). */
const CLOCKIN_OPEN_ALERT_THRESHOLD_MS = 12 * 60 * 60 * 1000;

// ─── Helpers internes ───────────────────────────────────────────────────────

type StoreBucket = {
  storeId: string;
  shiftsPlanned: number;
  shiftsCovered: number;
  clockInsOpen: number;
  plannedMinutes: number;
  workedMinutes: number;
  lateCount: number;
  presentNow: { employeeId: string; firstName: string; lastName: string }[];
};

function emptyStoreBucket(storeId: string): StoreBucket {
  return {
    storeId,
    shiftsPlanned: 0,
    shiftsCovered: 0,
    clockInsOpen: 0,
    plannedMinutes: 0,
    workedMinutes: 0,
    lateCount: 0,
    presentNow: [],
  };
}

// ─── Fonction principale ────────────────────────────────────────────────────

/**
 * Transforme données brutes du jour → snapshot manager.
 *
 * Algorithme :
 *   1. Construire `shiftsWithClockIns` Set<shiftId> pour calcul couverture
 *   2. Itérer shifts : agréger par store (plannedMinutes + shiftsPlanned + covered)
 *   3. Itérer clockIns : agréger par store (workedMinutes + clockInsOpen + lateCount)
 *      Si clockOutAt = null : ajouter à presentNow (avec nom employé)
 *   4. Détection alertes : CLOCKIN_NOT_CLOSED (> 12h ouvert) + LATE
 *   5. Compute summary global depuis les buckets
 *   6. Sort stores par nom (UI prédictible)
 */
export function buildTodayResponse(input: BuildTodayInput): BuildTodayOutput {
  const { shifts, clockIns, absences, employeesMap, storesMap, now = new Date() } = input;

  // 1. Couverture : quels shifts ont au moins 1 clockIn lié ?
  const shiftsWithClockIns = new Set<string>(
    clockIns.filter((c) => c.shiftId).map((c) => c.shiftId!),
  );

  const buckets = new Map<string, StoreBucket>();
  function getBucket(storeId: string): StoreBucket {
    let b = buckets.get(storeId);
    if (!b) {
      b = emptyStoreBucket(storeId);
      buckets.set(storeId, b);
    }
    return b;
  }

  // 2. Shifts → planned + covered
  for (const s of shifts) {
    const b = getBucket(s.storeId);
    b.shiftsPlanned += 1;
    b.plannedMinutes += computeShiftMinutes(s.startTime, s.endTime);
    if (shiftsWithClockIns.has(s.id)) {
      b.shiftsCovered += 1;
    }
  }

  // 3. ClockIns → worked + open + presentNow + late
  for (const c of clockIns) {
    const b = getBucket(c.storeId);
    const wr = computeWorkedMinutes(c.clockInAt, c.clockOutAt);
    b.workedMinutes += wr.worked;
    if (c.lateMinutes > 0) b.lateCount += 1;

    if (c.clockOutAt === null) {
      b.clockInsOpen += 1;
      const emp = employeesMap.get(c.employeeId);
      if (emp) {
        b.presentNow.push({
          employeeId: c.employeeId,
          firstName: emp.firstName,
          lastName: emp.lastName,
        });
      }
    }
  }

  // 4. Alertes
  const alerts: TodayAlert[] = [];
  const nowMs = now.getTime();

  for (const c of clockIns) {
    if (
      c.clockOutAt === null &&
      nowMs - c.clockInAt.getTime() > CLOCKIN_OPEN_ALERT_THRESHOLD_MS
    ) {
      alerts.push({
        type: "CLOCKIN_NOT_CLOSED",
        severity: "CRITICAL",
        employeeId: c.employeeId,
        storeId: c.storeId,
        shiftId: c.shiftId,
        clockInId: c.id,
        message: "Pointage ouvert depuis plus de 12h",
      });
    }
    if (c.lateMinutes > 0) {
      alerts.push({
        type: "LATE",
        severity: "INFO",
        employeeId: c.employeeId,
        storeId: c.storeId,
        shiftId: c.shiftId,
        clockInId: c.id,
        message: `Retard de ${c.lateMinutes} min`,
      });
    }
  }

  // 5. Stores enrichis avec contexte + tri par nom
  const stores: StoreToday[] = [...buckets.values()].map((b) => {
    const store = storesMap.get(b.storeId);
    return {
      storeId: b.storeId,
      storeName: store?.name ?? "",
      storeCode: store?.storeCode ?? null,
      shiftsPlanned: b.shiftsPlanned,
      shiftsCovered: b.shiftsCovered,
      clockInsOpen: b.clockInsOpen,
      plannedMinutes: b.plannedMinutes,
      workedMinutes: b.workedMinutes,
      lateCount: b.lateCount,
      presentNow: b.presentNow,
    };
  });
  stores.sort((a, b) => a.storeName.localeCompare(b.storeName));

  // 6. Summary global
  let shiftsPlanned = 0;
  let shiftsCovered = 0;
  let clockInsOpen = 0;
  let plannedMinutes = 0;
  let workedMinutes = 0;
  let lateMinutesTotal = 0;
  for (const s of stores) {
    shiftsPlanned += s.shiftsPlanned;
    shiftsCovered += s.shiftsCovered;
    clockInsOpen += s.clockInsOpen;
    plannedMinutes += s.plannedMinutes;
    workedMinutes += s.workedMinutes;
  }
  for (const c of clockIns) {
    lateMinutesTotal += c.lateMinutes;
  }

  // absencesApproved : nb d'employés distincts en absence approuvée aujourd'hui
  const absencesEmployeeIds = new Set<string>(absences.map((a) => a.employeeId));

  const summary: TodaySummary = {
    storesActive: stores.length,
    shiftsPlanned,
    shiftsCovered,
    shiftsUncovered: shiftsPlanned - shiftsCovered,
    clockInsTotal: clockIns.length,
    clockInsOpen,
    plannedMinutes,
    workedMinutes,
    inProgressMinutes: 0, // V1 : informatif via clockInsOpen, pas de calcul "depuis"
    lateMinutesTotal,
    coverageRate:
      shiftsPlanned === 0 ? 0 : shiftsCovered / shiftsPlanned,
    absencesApproved: absencesEmployeeIds.size,
  };

  return { summary, stores, alerts };
}

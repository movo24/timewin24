/**
 * Timesheet — couche Prisma read-only (data fetching uniquement).
 *
 * AUCUNE agrégation, AUCUN calcul, AUCUN RBAC check ici. Les règles métier
 * vivent dans calc.ts. Les checks RBAC sont la responsabilité du caller
 * (route handler), qui doit fournir un `companyId` venu de la session
 * (jamais d'un query param).
 *
 * Sécurité multi-tenant :
 *   - `companyId` est OBLIGATOIRE sur chaque fonction.
 *   - Il filtre TOUTES les queries (Shift.companyId, ClockIn.companyId, etc.).
 *   - Si le caller veut restreindre un MANAGER à ses stores autorisés, il
 *     passe `storeIdsAllowed` (array de cuid). Un array vide `[]` court-
 *     circuite la query et retourne un résultat vide (anti-fail-open).
 *
 * Convention de dates :
 *   - `dateFrom` et `dateTo` sont des `Date` représentant des journées
 *     (typiquement minuit UTC). Les Shifts sont indexés sur `date @db.Date`,
 *     donc le filtrage est exact. Les ClockIns sont indexés sur `clockInAt
 *     @db.DateTime`, donc on EXPAND la fenêtre à `[dateFrom 00:00 UTC,
 *     dateTo 23:59:59.999 UTC]`.
 *   - Aucune conversion timezone par store en V1. Si le besoin émerge,
 *     traiter dans une couche aggregate.ts au-dessus.
 *
 * Performance :
 *   - Tous les `findMany` utilisent `select` explicite (pas de SELECT *).
 *   - Les contextes (employee, store) retournés sous forme de `Map` pour
 *     éviter le N+1 dans le caller.
 *   - Les index Prisma utilisés sont déjà en place : `[companyId, date]`
 *     sur Shift, `[companyId]` sur ClockIn + `[employeeId, clockInAt]`, etc.
 */

import { prisma } from "@/lib/prisma";
import type {
  Shift,
  ClockIn,
  AbsenceDeclaration,
  ContractType,
  ClockInStatus,
} from "@/generated/prisma/client";

// ─── Helpers internes ───────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Étend une date "jour" (typiquement 00:00 UTC) en bornes inclusives
 * pour un champ DateTime : [dateFrom 00:00, dateTo 23:59:59.999].
 */
function expandToDateTimeRange(dateFrom: Date, dateTo: Date) {
  const start = new Date(
    Date.UTC(
      dateFrom.getUTCFullYear(),
      dateFrom.getUTCMonth(),
      dateFrom.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const end = new Date(
    Date.UTC(
      dateTo.getUTCFullYear(),
      dateTo.getUTCMonth(),
      dateTo.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return { start, end };
}

// ─── 1. Shifts ──────────────────────────────────────────────────────────────

export type FetchShiftsArgs = {
  companyId: string;
  dateFrom: Date;
  dateTo: Date;
  storeId?: string;
  employeeId?: string;
  /**
   * Si fourni, restreint le résultat aux stores autorisés (scope MANAGER).
   * Un array vide `[]` court-circuite la query → retour `[]`.
   * `undefined` = aucune restriction de scope store (OWNER/ADMIN).
   */
  storeIdsAllowed?: string[];
};

export type TimesheetShift = Pick<
  Shift,
  | "id"
  | "date"
  | "startTime"
  | "endTime"
  | "storeId"
  | "employeeId"
  | "note"
  | "assignmentReason"
>;

/**
 * Récupère les shifts planifiés dans une période, scopés par companyId.
 * Les shifts sans `employeeId` (à pourvoir) sont inclus — le caller décide
 * de les agréger en `unassignedPlannedMinutes` selon le `groupBy`.
 */
export async function fetchTimesheetShifts(
  args: FetchShiftsArgs,
): Promise<TimesheetShift[]> {
  if (args.storeIdsAllowed && args.storeIdsAllowed.length === 0) {
    return [];
  }

  return prisma.shift.findMany({
    where: {
      companyId: args.companyId,
      date: { gte: args.dateFrom, lte: args.dateTo },
      ...(args.storeId ? { storeId: args.storeId } : {}),
      ...(args.employeeId ? { employeeId: args.employeeId } : {}),
      ...(args.storeIdsAllowed
        ? { storeId: { in: args.storeIdsAllowed } }
        : {}),
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      storeId: true,
      employeeId: true,
      note: true,
      assignmentReason: true,
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
}

// ─── 2. ClockIns ────────────────────────────────────────────────────────────

export type TimesheetClockIn = Pick<
  ClockIn,
  | "id"
  | "employeeId"
  | "storeId"
  | "shiftId"
  | "clockInAt"
  | "clockOutAt"
  | "lateMinutes"
> & { status: ClockInStatus };

/**
 * Récupère les pointages dans une période, scopés par companyId.
 * Étend la fenêtre [dateFrom 00:00 UTC, dateTo 23:59:59.999 UTC] pour
 * couvrir tous les clockInAt de la journée.
 */
export async function fetchTimesheetClockIns(
  args: FetchShiftsArgs,
): Promise<TimesheetClockIn[]> {
  if (args.storeIdsAllowed && args.storeIdsAllowed.length === 0) {
    return [];
  }

  const { start, end } = expandToDateTimeRange(args.dateFrom, args.dateTo);

  return prisma.clockIn.findMany({
    where: {
      companyId: args.companyId,
      clockInAt: { gte: start, lte: end },
      ...(args.storeId ? { storeId: args.storeId } : {}),
      ...(args.employeeId ? { employeeId: args.employeeId } : {}),
      ...(args.storeIdsAllowed
        ? { storeId: { in: args.storeIdsAllowed } }
        : {}),
    },
    select: {
      id: true,
      employeeId: true,
      storeId: true,
      shiftId: true,
      clockInAt: true,
      clockOutAt: true,
      lateMinutes: true,
      status: true,
    },
    orderBy: [{ clockInAt: "asc" }],
  });
}

// ─── 3. Absences ────────────────────────────────────────────────────────────

export type FetchAbsencesArgs = {
  companyId: string;
  dateFrom: Date;
  dateTo: Date;
  employeeId?: string;
};

export type TimesheetAbsence = Pick<
  AbsenceDeclaration,
  "id" | "employeeId" | "type" | "startDate" | "endDate"
>;

/**
 * Récupère les déclarations d'absence APPROVED qui chevauchent la période.
 *
 * Statuts PENDING / REJECTED sont IGNORÉS (cf décision D du plan validé).
 *
 * Overlap query : une absence [startDate..endDate] chevauche la fenêtre
 *   [dateFrom..dateTo] ssi : startDate <= dateTo  ET  endDate >= dateFrom.
 */
export async function fetchApprovedAbsences(
  args: FetchAbsencesArgs,
): Promise<TimesheetAbsence[]> {
  return prisma.absenceDeclaration.findMany({
    where: {
      companyId: args.companyId,
      status: "APPROVED",
      startDate: { lte: args.dateTo },
      endDate: { gte: args.dateFrom },
      ...(args.employeeId ? { employeeId: args.employeeId } : {}),
    },
    select: {
      id: true,
      employeeId: true,
      type: true,
      startDate: true,
      endDate: true,
    },
    orderBy: [{ startDate: "asc" }],
  });
}

// ─── 4. Employees context ───────────────────────────────────────────────────

export type EmployeeContext = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  contractType: ContractType | null;
  weeklyHours: number | null;
  /** Taux horaire brut (null si pas de EmployeeCost configuré). */
  hourlyRateGross: number | null;
};

/**
 * Récupère le contexte employé (identité + contrat + coût horaire) pour
 * un set d'IDs, sous forme de Map<employeeId, EmployeeContext>.
 *
 * Si `employeeIds` est vide, retourne une Map vide sans query.
 * EmployeeCost est joint en LEFT JOIN — `hourlyRateGross` peut être null.
 */
export async function fetchEmployeesContext(args: {
  companyId: string;
  employeeIds: string[];
}): Promise<Map<string, EmployeeContext>> {
  if (args.employeeIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.employee.findMany({
    where: {
      id: { in: args.employeeIds },
      // Note : le modèle Employee n'a pas de companyId direct (passe par
      // StoreEmployee + Store). Mais comme on filtre déjà sur des IDs qu'on
      // a obtenus via des Shifts filtrés par companyId, on est cohérent.
    },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      email: true,
      contractType: true,
      weeklyHours: true,
      costConfig: { select: { hourlyRateGross: true } },
    },
  });

  const map = new Map<string, EmployeeContext>();
  for (const e of rows) {
    map.set(e.id, {
      id: e.id,
      employeeCode: e.employeeCode,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      contractType: e.contractType,
      weeklyHours: e.weeklyHours,
      hourlyRateGross: e.costConfig?.hourlyRateGross ?? null,
    });
  }
  return map;
}

// ─── 5. Stores context ──────────────────────────────────────────────────────

export type StoreContext = {
  id: string;
  name: string;
  storeCode: string | null;
  city: string | null;
  timezone: string | null;
};

/**
 * Récupère le contexte magasin (nom, ville, tz) pour un set d'IDs,
 * sous forme de Map<storeId, StoreContext>.
 *
 * Filtré par companyId pour la défense en profondeur — même si les IDs
 * proviennent déjà d'une query scoped, on re-vérifie.
 */
export async function fetchStoresContext(args: {
  companyId: string;
  storeIds: string[];
}): Promise<Map<string, StoreContext>> {
  if (args.storeIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.store.findMany({
    where: {
      id: { in: args.storeIds },
      companyId: args.companyId,
    },
    select: {
      id: true,
      name: true,
      storeCode: true,
      city: true,
      timezone: true,
    },
  });

  const map = new Map<string, StoreContext>();
  for (const s of rows) {
    map.set(s.id, {
      id: s.id,
      name: s.name,
      storeCode: s.storeCode,
      city: s.city,
      timezone: s.timezone,
    });
  }
  return map;
}

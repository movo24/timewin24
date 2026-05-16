/**
 * GET /api/timesheet
 *
 * Endpoint principal Timesheet — Commit 3/N de feat/timesheet-api.
 *
 * Couche d'orchestration HTTP uniquement :
 *   - auth + tenant context (NextAuth + Phase 7 helpers)
 *   - validation Zod
 *   - RBAC (SUPER_ADMIN / OWNER / ADMIN / MANAGER / EMPLOYEE)
 *   - appels read-only Prisma (couche query.ts)
 *   - construction réponse via aggregate.ts (logique métier extraite)
 *
 * Aucune logique métier ici. Aucune logique Prisma. Aucune logique de calcul.
 *
 * Voir :
 *   - src/lib/timesheet/calc.ts       : math pure
 *   - src/lib/timesheet/query.ts      : lecture Prisma read-only
 *   - src/lib/timesheet/aggregate.ts  : transformation métier
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireCompanyContext,
  getCompanyScopedStoreIds,
} from "@/lib/company-context";
import {
  fetchTimesheetShifts,
  fetchTimesheetClockIns,
  fetchApprovedAbsences,
  fetchEmployeesContext,
  fetchStoresContext,
} from "@/lib/timesheet/query";
import { buildTimesheetResponse } from "@/lib/timesheet/aggregate";

// ─── Validation des query params ────────────────────────────────────────────

const MAX_RANGE_DAYS = 92;

const querySchema = z
  .object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "format YYYY-MM-DD attendu"),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "format YYYY-MM-DD attendu"),
    storeId: z.string().cuid().optional(),
    employeeId: z.string().cuid().optional(),
    groupBy: z
      .enum(["employee", "store", "day", "week"])
      .default("employee"),
    includeAnomalies: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    currency: z.literal("EUR").default("EUR"),
  })
  .refine((d) => d.dateFrom <= d.dateTo, {
    message: "dateFrom doit être <= dateTo",
    path: ["dateFrom"],
  })
  .refine(
    (d) => {
      const ms = +new Date(d.dateTo) - +new Date(d.dateFrom);
      return ms / (24 * 60 * 60 * 1000) <= MAX_RANGE_DAYS;
    },
    { message: `Période max ${MAX_RANGE_DAYS} jours`, path: ["dateTo"] },
  );

// ─── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Auth + tenant context
  const { ctx, error: ctxError } = await requireCompanyContext();
  if (ctxError) return ctxError;
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // SUPER_ADMIN V1 : on exige une companyId en session (pas de cross-company)
  if (ctx.isPlatformAdmin && !ctx.companyId) {
    return NextResponse.json(
      {
        error:
          "SUPER_ADMIN sans companyId en session — non supporté en V1. Choisissez une Company avant d'appeler ce endpoint.",
      },
      { status: 400 },
    );
  }
  const companyId = ctx.companyId!;

  // 2. Validation Zod
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Paramètres invalides",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const { dateFrom, dateTo, storeId, employeeId, groupBy, includeAnomalies } =
    parsed.data;

  // 3. RBAC : scope stores + employeeId forcé pour EMPLOYEE
  const role = ctx.role;
  const isEmployee = role === "EMPLOYEE";
  const hideMoneyFields = isEmployee;

  // SUPER_ADMIN avec companyId → pas de restriction store
  // OWNER / ADMIN → pas de restriction (accès à toute leur company)
  // MANAGER / EMPLOYEE → scope sur leurs stores autorisés
  let scopeStoreIds: string[] | undefined;
  if (!ctx.isPlatformAdmin && (role === "MANAGER" || isEmployee)) {
    const allowed = await getCompanyScopedStoreIds(ctx);
    scopeStoreIds = allowed ?? [];
  }

  // MANAGER : storeId query param doit être dans le scope
  if (
    role === "MANAGER" &&
    storeId &&
    scopeStoreIds &&
    !scopeStoreIds.includes(storeId)
  ) {
    return NextResponse.json(
      { error: "Magasin hors de votre périmètre" },
      { status: 403 },
    );
  }

  // EMPLOYEE : employeeId forcé à soi-même (lecture DB User.employeeId)
  let effectiveEmployeeId = employeeId;
  if (isEmployee) {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { employeeId: true },
    });
    if (!user?.employeeId) {
      return NextResponse.json(
        { error: "Compte non lié à un employé" },
        { status: 403 },
      );
    }
    effectiveEmployeeId = user.employeeId;
  }

  // 4. Bornes de date en UTC
  const dateFromObj = new Date(dateFrom + "T00:00:00Z");
  const dateToObj = new Date(dateTo + "T00:00:00Z");
  const daysCount =
    Math.floor(
      (dateToObj.getTime() - dateFromObj.getTime()) / (24 * 60 * 60 * 1000),
    ) + 1;

  // 5. Fetch en parallèle (read-only Prisma)
  const fetchArgs = {
    companyId,
    dateFrom: dateFromObj,
    dateTo: dateToObj,
    storeId,
    employeeId: effectiveEmployeeId,
    storeIdsAllowed: scopeStoreIds,
  };

  const [shifts, clockIns, absences] = await Promise.all([
    fetchTimesheetShifts(fetchArgs),
    fetchTimesheetClockIns(fetchArgs),
    fetchApprovedAbsences({
      companyId,
      dateFrom: dateFromObj,
      dateTo: dateToObj,
      employeeId: effectiveEmployeeId,
    }),
  ]);

  // 6. Fetch contextes (employee + store) en parallèle
  const employeeIdsSet = new Set<string>();
  const storeIdsSet = new Set<string>();
  for (const s of shifts) {
    if (s.employeeId) employeeIdsSet.add(s.employeeId);
    storeIdsSet.add(s.storeId);
  }
  for (const c of clockIns) {
    employeeIdsSet.add(c.employeeId);
    storeIdsSet.add(c.storeId);
  }
  for (const a of absences) {
    employeeIdsSet.add(a.employeeId);
  }

  const [employeesMap, storesMap] = await Promise.all([
    fetchEmployeesContext({ companyId, employeeIds: [...employeeIdsSet] }),
    fetchStoresContext({ companyId, storeIds: [...storeIdsSet] }),
  ]);

  // 7. Agrégation métier (couche aggregate.ts)
  const aggregated = buildTimesheetResponse({
    shifts,
    clockIns,
    absences,
    employeesMap,
    storesMap,
    dateFrom: dateFromObj,
    dateTo: dateToObj,
    groupBy,
    hideMoneyFields,
    includeAnomalies,
  });

  // 8. Wrap dans la réponse finale avec meta
  return NextResponse.json(
    {
      meta: {
        companyId,
        dateFrom,
        dateTo,
        daysCount,
        groupBy,
        storesScope: scopeStoreIds ?? null,
        generatedAt: new Date().toISOString(),
        currency: "EUR" as const,
      },
      totals: aggregated.totals,
      rows: aggregated.rows,
      ...(aggregated.anomalies ? { anomalies: aggregated.anomalies } : {}),
    },
    { status: 200 },
  );
}

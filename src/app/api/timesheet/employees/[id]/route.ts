/**
 * GET /api/timesheet/employees/[id]
 *
 * Commit 4/N. Endpoint raccourci : timesheet d'un seul employé sur une période.
 *
 * Pas un duplicate de /api/timesheet — c'est un wrapper qui force :
 *   - employeeId = params.id (depuis l'URL)
 *   - groupBy = "employee" (implicite)
 *   - storeId / autres options non acceptés (URL = source de vérité)
 *
 * La réponse expose l'objet `employee` à la racine (vs un array de 1 row)
 * pour ergonomie UI.
 *
 * Pour une vue semaine, l'UI appellera /api/timesheet?groupBy=week&employeeId=X.
 *
 * Architecture :
 *   - calc.ts       : math pure (importée par aggregate)
 *   - query.ts      : lecture Prisma
 *   - aggregate.ts  : transformation métier (buildTimesheetResponse)
 *   - route.ts      : ICI — HTTP + RBAC + Zod orchestration
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
    includeAnomalies: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
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

const idSchema = z.string().cuid();

// ─── Handler ────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Auth + tenant context
  const { ctx, error: ctxError } = await requireCompanyContext();
  if (ctxError) return ctxError;
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.isPlatformAdmin && !ctx.companyId) {
    return NextResponse.json(
      {
        error:
          "SUPER_ADMIN sans companyId en session — non supporté en V1.",
      },
      { status: 400 },
    );
  }
  const companyId = ctx.companyId!;

  // 2. Valider params.id (cuid)
  const awaitedParams = await params;
  const idParsed = idSchema.safeParse(awaitedParams.id);
  if (!idParsed.success) {
    return NextResponse.json(
      { error: "ID employé invalide (cuid attendu)" },
      { status: 400 },
    );
  }
  const employeeId = idParsed.data;

  // 3. Valider query params
  const url = new URL(req.url);
  const queryParsed = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!queryParsed.success) {
    return NextResponse.json(
      {
        error: "Paramètres invalides",
        details: queryParsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const { dateFrom, dateTo, includeAnomalies } = queryParsed.data;

  // 4. RBAC : déterminer les contraintes selon le rôle
  const role = ctx.role;
  const isEmployee = role === "EMPLOYEE";
  const hideMoneyFields = isEmployee;

  // EMPLOYEE : ne peut voir que lui-même
  if (isEmployee) {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { employeeId: true },
    });
    if (!user?.employeeId || user.employeeId !== employeeId) {
      return NextResponse.json(
        { error: "Accès refusé" },
        { status: 403 },
      );
    }
  }

  // Récupérer l'employee + check companyId + StoreEmployee links (pour MANAGER scope)
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      contractType: true,
      weeklyHours: true,
      companyId: true,
      stores: { select: { storeId: true } },
      costConfig: { select: { hourlyRateGross: true } },
    },
  });

  if (!employee) {
    return NextResponse.json(
      { error: "Employé introuvable" },
      { status: 404 },
    );
  }

  // Cross-company : masquer comme 404 (pas leaker l'existence)
  if (!ctx.isPlatformAdmin && employee.companyId !== companyId) {
    return NextResponse.json(
      { error: "Employé introuvable" },
      { status: 404 },
    );
  }

  // MANAGER : intersection stores autorisés ∩ stores de l'employé ≠ vide
  if (role === "MANAGER") {
    const managerStoreIds = await getCompanyScopedStoreIds(ctx);
    const allowedSet = new Set<string>(managerStoreIds ?? []);
    const employeeStoreIds = employee.stores.map((s) => s.storeId);
    const hasIntersection = employeeStoreIds.some((sid) => allowedSet.has(sid));
    if (!hasIntersection) {
      return NextResponse.json(
        { error: "Employé hors de votre périmètre" },
        { status: 403 },
      );
    }
  }

  // 5. Bornes UTC + daysCount
  const dateFromObj = new Date(dateFrom + "T00:00:00Z");
  const dateToObj = new Date(dateTo + "T00:00:00Z");
  const daysCount =
    Math.floor(
      (dateToObj.getTime() - dateFromObj.getTime()) / (24 * 60 * 60 * 1000),
    ) + 1;

  // 6. Fetch en parallèle (employeeId forcé sur cet employé uniquement)
  const fetchArgs = {
    companyId,
    dateFrom: dateFromObj,
    dateTo: dateToObj,
    employeeId,
  };

  const [shifts, clockIns, absences] = await Promise.all([
    fetchTimesheetShifts(fetchArgs),
    fetchTimesheetClockIns(fetchArgs),
    fetchApprovedAbsences(fetchArgs),
  ]);

  // 7. Contexts (employee unique + stores rencontrés)
  const storeIdsSet = new Set<string>();
  for (const s of shifts) storeIdsSet.add(s.storeId);
  for (const c of clockIns) storeIdsSet.add(c.storeId);

  const [employeesMap, storesMap] = await Promise.all([
    fetchEmployeesContext({ companyId, employeeIds: [employeeId] }),
    fetchStoresContext({ companyId, storeIds: [...storeIdsSet] }),
  ]);

  // 8. Agrégation via couche partagée (groupBy=employee forcé)
  const aggregated = buildTimesheetResponse({
    shifts,
    clockIns,
    absences,
    employeesMap,
    storesMap,
    dateFrom: dateFromObj,
    dateTo: dateToObj,
    groupBy: "employee",
    hideMoneyFields,
    includeAnomalies,
  });

  // 9. Construire la réponse avec employee à la racine (pas dans rows[])
  const empCtx = employeesMap.get(employeeId);

  return NextResponse.json(
    {
      meta: {
        companyId,
        dateFrom,
        dateTo,
        daysCount,
        generatedAt: new Date().toISOString(),
        currency: "EUR" as const,
        employeeId,
      },
      employee: {
        id: employee.id,
        employeeCode: empCtx?.employeeCode ?? employee.employeeCode,
        firstName: empCtx?.firstName ?? employee.firstName,
        lastName: empCtx?.lastName ?? employee.lastName,
        contractType: empCtx?.contractType ?? employee.contractType ?? null,
        weeklyHours: empCtx?.weeklyHours ?? employee.weeklyHours ?? null,
        hourlyRateGross: hideMoneyFields
          ? null
          : (empCtx?.hourlyRateGross ??
              employee.costConfig?.hourlyRateGross ??
              null),
      },
      totals: aggregated.totals,
      ...(aggregated.anomalies ? { anomalies: aggregated.anomalies } : {}),
    },
    { status: 200 },
  );
}

/**
 * GET /api/timesheet/today
 *
 * Commit 5/N. Vue "Aujourd'hui Manager" — snapshot temps réel pour
 * dashboard mobile + desktop.
 *
 * Pas de query params de période (force "today" en UTC).
 * Pas de groupBy (structure de réponse fixe : summary + stores[] + alerts[]).
 * Réservé manager/admin/owner (EMPLOYEE → 403).
 *
 * Architecture :
 *   - calc.ts       : math pure
 *   - query.ts      : lecture Prisma read-only
 *   - aggregate.ts  : timesheet par groupBy (non utilisé ici)
 *   - today.ts      : logique métier spécifique "aujourd'hui" (NOUVEAU)
 *   - route.ts      : ICI — HTTP + RBAC + Zod orchestration
 *
 * Limite V1 : timezone UTC. Pour multi-pays, V2 doit utiliser Store.timezone.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
import { buildTodayResponse } from "@/lib/timesheet/today";

// ─── Validation des query params ────────────────────────────────────────────

const querySchema = z.object({
  storeId: z.string().cuid().optional(),
  currency: z.literal("EUR").default("EUR"),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** UTC minuit du jour de `now`. */
function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
}

function dateOnlyISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
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

  // 2. RBAC : EMPLOYEE refusé (endpoint manager-only)
  if (ctx.role === "EMPLOYEE") {
    return NextResponse.json(
      { error: "Accès refusé — endpoint réservé aux managers" },
      { status: 403 },
    );
  }

  // 3. Validation Zod
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
  const { storeId } = parsed.data;

  // 4. RBAC scope MANAGER
  let scopeStoreIds: string[] | undefined;
  if (ctx.role === "MANAGER") {
    const allowed = await getCompanyScopedStoreIds(ctx);
    scopeStoreIds = allowed ?? [];
    if (storeId && !scopeStoreIds.includes(storeId)) {
      return NextResponse.json(
        { error: "Magasin hors de votre périmètre" },
        { status: 403 },
      );
    }
  }

  // 5. Fenêtre "aujourd'hui" (UTC strict, V1)
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = todayStart; // single day — query.ts expand pour clockInAt

  // 6. Fetch en parallèle
  const fetchArgs = {
    companyId,
    dateFrom: todayStart,
    dateTo: todayEnd,
    storeId,
    storeIdsAllowed: scopeStoreIds,
  };

  const [shifts, clockIns, absences] = await Promise.all([
    fetchTimesheetShifts(fetchArgs),
    fetchTimesheetClockIns(fetchArgs),
    fetchApprovedAbsences({
      companyId,
      dateFrom: todayStart,
      dateTo: todayEnd,
    }),
  ]);

  // 7. Contexts (employees pour presentNow + stores)
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

  // 8. Construction du snapshot via today.ts
  const today = buildTodayResponse({
    shifts,
    clockIns,
    absences,
    employeesMap,
    storesMap,
    now,
  });

  // 9. Réponse finale
  return NextResponse.json(
    {
      meta: {
        companyId,
        date: dateOnlyISO(todayStart),
        storesScope: scopeStoreIds ?? null,
        generatedAt: now.toISOString(),
        currency: "EUR" as const,
      },
      summary: today.summary,
      stores: today.stores,
      alerts: today.alerts,
    },
    { status: 200 },
  );
}

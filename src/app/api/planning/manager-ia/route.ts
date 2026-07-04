import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, getAccessibleStoreIds, successResponse, errorResponse } from "@/lib/api-helpers";
import { isStoreAccessible, resolveStoreWhere } from "@/lib/store-scope";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const managerIaSchema = z.object({
  command: z.string().min(1).max(1000),
  weekStart: z.string().min(1),
  storeId: z.string().optional(),
  execute: z.boolean().optional().default(false),
});
import { toUTCDate, getWeekBounds, formatDate } from "@/lib/utils";
import { resolveCommand } from "@/lib/manager-ia/resolver";
import { planCommand } from "@/lib/manager-ia/planner";
import { enhancedParse } from "@/lib/ai-engine/nlp/enhanced-pipeline";
import type { Proposal, ExecutionResult } from "@/lib/manager-ia/types";
import type { ResolverContext } from "@/lib/manager-ia/resolver";
import type { PlannerContext } from "@/lib/manager-ia/planner";

/**
 * POST /api/planning/manager-ia
 *
 * Pipeline: Parser → Resolver → Planner → (Executor)
 *
 * Body: { command, weekStart, storeId?, execute? }
 */
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const body = await req.json();
    const validatedBody = managerIaSchema.safeParse(body);
    if (!validatedBody.success) {
      return errorResponse(validatedBody.error.issues.map((e) => e.message).join(", "));
    }
    const { command, weekStart, storeId, execute } = validatedBody.data;

    // ─── Périmètre magasin ───────────────────────
    // Un manager ne planifie que ses magasins ; les données chargées ET
    // l'exécuteur sont bornés au périmètre (defense-in-depth).
    const { storeIds: accessibleStoreIds, error: scopeErr } = await getAccessibleStoreIds();
    if (scopeErr) return scopeErr;
    const scoped = resolveStoreWhere(accessibleStoreIds, storeId);
    if (!scoped.ok) return errorResponse("Magasin hors de votre périmètre", 403);
    const storeIdWhere = scoped.where; // string | {in} | undefined

    // ─── Load data from DB ───────────────────────
    const { weekStart: wsDate, weekEnd: weDate } = getWeekBounds(weekStart);
    const today = formatDate(new Date());

    // Load employees with stores and unavailabilities (restreints au périmètre)
    const employees = await prisma.employee.findMany({
      where: {
        active: true,
        ...(accessibleStoreIds !== null
          ? { stores: { some: { storeId: { in: accessibleStoreIds } } } }
          : {}),
      },
      include: {
        stores: { select: { storeId: true } },
        unavailabilities: {
          select: {
            type: true,
            dayOfWeek: true,
            date: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    // Load stores with schedules (restreints au périmètre)
    const stores = await prisma.store.findMany({
      ...(storeIdWhere !== undefined ? { where: { id: storeIdWhere } } : {}),
      include: {
        schedules: {
          select: {
            dayOfWeek: true,
            closed: true,
            openTime: true,
            closeTime: true,
            minEmployees: true,
            maxEmployees: true,
          },
        },
      },
    });

    // Load existing shifts for the week
    const shiftsRaw = await prisma.shift.findMany({
      where: {
        date: { gte: wsDate, lte: weDate },
        ...(storeIdWhere !== undefined ? { storeId: storeIdWhere } : {}),
      },
      include: {
        store: { select: { id: true, name: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // ─── Build contexts ──────────────────────────

    const resolverCtx: ResolverContext = {
      employees: employees.map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        stores: e.stores,
      })),
      stores: stores.map((s) => ({
        id: s.id,
        name: s.name,
        schedules: s.schedules.map((sc) => ({
          dayOfWeek: sc.dayOfWeek,
          closed: sc.closed,
          openTime: sc.openTime,
          closeTime: sc.closeTime,
        })),
      })),
      existingShifts: shiftsRaw.map((s) => ({
        id: s.id,
        employeeId: s.employeeId,
        storeId: s.storeId,
        date: (s.date as Date).toISOString().split("T")[0],
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      weekStart,
      today,
    };

    const plannerCtx: PlannerContext = {
      employees: employees.map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        weeklyHours: e.weeklyHours,
        maxHoursPerDay: e.maxHoursPerDay ?? 10,
        maxHoursPerWeek: e.maxHoursPerWeek ?? 48,
        minRestBetween: e.minRestBetween ?? 11,
        shiftPreference: (e.shiftPreference as "MATIN" | "APRES_MIDI" | "JOURNEE") || "JOURNEE",
        unavailabilities: e.unavailabilities.map((u) => ({
          type: u.type as "FIXED" | "VARIABLE",
          dayOfWeek: u.dayOfWeek,
          date: u.date ? (u.date as Date).toISOString().split("T")[0] : null,
          startTime: u.startTime,
          endTime: u.endTime,
        })),
        stores: e.stores,
      })),
      stores: stores.map((s) => ({
        id: s.id,
        name: s.name,
        minEmployees: s.minEmployees ?? 1,
        schedules: s.schedules.map((sc) => ({
          dayOfWeek: sc.dayOfWeek,
          closed: sc.closed,
          openTime: sc.openTime,
          closeTime: sc.closeTime,
          minEmployees: sc.minEmployees,
        })),
      })),
      shifts: shiftsRaw.map((s) => ({
        id: s.id,
        employeeId: s.employeeId,
        storeId: s.storeId,
        storeName: s.store.name,
        date: (s.date as Date).toISOString().split("T")[0],
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      weekStart,
    };

    // ─── Pipeline: Parse → Resolve → Plan ────────

    const parseContext = {
      knownEmployees: employees.map((e) => ({
        firstName: e.firstName,
        lastName: e.lastName,
      })),
      knownStores: stores.map((s) => s.name),
    };

    const parsed = await enhancedParse(command, parseContext, {
      fallbackToGemini: true,
      today,
      weekStart,
    });
    const resolved = resolveCommand(parsed, resolverCtx);
    const proposal = planCommand(resolved, plannerCtx, parsed);

    // ─── Execute if requested ────────────────────

    if (execute && proposal.actions.length > 0) {
      const result = await executeProposal(proposal, session!.user.id, accessibleStoreIds);
      return successResponse({ proposal, result });
    }

    return successResponse({ proposal });
  } catch (err) {
    logger.error("POST /api/planning/manager-ia error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

// ─── Executor ───────────────────────────────────

async function executeProposal(
  proposal: Proposal,
  userId: string,
  accessibleStoreIds: string[] | null
): Promise<ExecutionResult> {
  let applied = 0;
  const errors: string[] = [];

  for (const action of proposal.actions) {
    try {
      // Garde de périmètre : refuser toute mutation hors des magasins autorisés.
      // Pour create/update, le magasin cible = action.storeId. Pour delete, on
      // vérifie le magasin du shift existant.
      if (action.type === "create" || action.type === "update") {
        if (action.storeId && !isStoreAccessible(accessibleStoreIds, action.storeId)) {
          errors.push("Action ignorée : magasin hors de votre périmètre.");
          continue;
        }
      }
      if ((action.type === "update" || action.type === "delete") && action.shiftId) {
        const existing = await prisma.shift.findUnique({
          where: { id: action.shiftId },
          select: { storeId: true },
        });
        if (existing && !isStoreAccessible(accessibleStoreIds, existing.storeId)) {
          errors.push("Action ignorée : shift d'un magasin hors de votre périmètre.");
          continue;
        }
      }
      switch (action.type) {
        case "create": {
          await prisma.shift.create({
            data: {
              storeId: action.storeId,
              employeeId: action.employeeId || null,
              date: toUTCDate(action.date),
              startTime: action.startTime,
              endTime: action.endTime,
              note: `Manager IA — ${action.explanation}`,
            },
          });
          applied++;
          break;
        }
        case "update": {
          if (!action.shiftId) {
            errors.push("ID de shift manquant pour la mise à jour.");
            break;
          }
          await prisma.shift.update({
            where: { id: action.shiftId },
            data: {
              storeId: action.storeId,
              employeeId: action.employeeId || null,
              date: toUTCDate(action.date),
              startTime: action.startTime,
              endTime: action.endTime,
              note: `Manager IA — ${action.explanation}`,
            },
          });
          applied++;
          break;
        }
        case "delete": {
          if (!action.shiftId) {
            errors.push("ID de shift manquant pour la suppression.");
            break;
          }
          await prisma.shift.delete({
            where: { id: action.shiftId },
          });
          applied++;
          break;
        }
      }
    } catch {
      errors.push(`Erreur lors de l'action ${action.type}`);
    }
  }

  await logAudit(userId, "CREATE", "ManagerIA", "command", {
    command: proposal.parsedIntent.rawCommand,
    actions: proposal.actions.length,
    applied,
    errors: errors.length,
  });

  return {
    success: errors.length === 0,
    applied,
    errors,
  };
}

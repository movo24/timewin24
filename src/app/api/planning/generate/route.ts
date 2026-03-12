import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, getAccessibleStoreIds, successResponse, errorResponse } from "@/lib/api-helpers";
import { autoGenerateSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { toUTCDate } from "@/lib/utils";
import { loadSolverInput, loadAllStoresSolverInput } from "@/lib/solver/data-loader";
import { solve, solveMultiStore, solveWithScenarios, solveMultiStoreWithScenarios } from "@/lib/solver/solver";
import { generateCrossStoreSuggestions } from "@/lib/solver/suggestions";
import { DEFAULT_SCENARIO_CONFIG } from "@/lib/solver/types";
import type { SolverResult, ScenarioResult } from "@/lib/solver/types";

/**
 * POST /api/planning/generate
 *
 * Two modes:
 * - "preview": runs the solver and returns suggested shifts (no DB write)
 * - "save": runs the solver AND creates the shifts in DB (transaction)
 *
 * If storeId is provided: solve for that store only.
 * If storeId is empty/omitted: solve for ALL stores at once (global view).
 * RBAC: Manager can only generate for their assigned stores.
 *
 * If useScenarios is true: runs multi-scenario solver with scoring.
 */
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const user = session!.user as { id: string; role: string; employeeId: string | null };
    const body = await req.json();
    const parsed = autoGenerateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { storeId, weekStart, mode, shiftDurationHours, shiftGranularity, useScenarios, idealShiftRange, useManagerBrain } = parsed.data;

    // RBAC: Manager can only generate planning for their assigned stores
    if (user.role === "MANAGER") {
      const { storeIds } = await getAccessibleStoreIds();
      if (storeId) {
        if (storeIds && !storeIds.includes(storeId)) {
          return errorResponse("Accès refusé : vous n'êtes pas assigné à ce magasin", 403);
        }
      } else {
        // Manager without storeId = block (must specify a store)
        return errorResponse("Vous devez spécifier un magasin pour la génération", 403);
      }
    }

    let result: SolverResult;
    let scenarioResult: ScenarioResult | null = null;

    if (useScenarios) {
      // ─── Scenario-based solver ───
      const config = {
        ...DEFAULT_SCENARIO_CONFIG,
        idealShiftHours: (idealShiftRange || [4, 6]) as [number, number],
      };

      if (storeId) {
        const store = await prisma.store.findUnique({ where: { id: storeId } });
        if (!store) return errorResponse("Magasin non trouvé", 404);

        const solverInput = await loadSolverInput(storeId, weekStart, {
          mode, shiftDurationHours, shiftGranularity,
        });

        if (solverInput.employees.length === 0) {
          return errorResponse("Aucun employé actif assigné à ce magasin.", 400);
        }
        if (solverInput.weekDays.length === 0) {
          return errorResponse("Aucun jour ouvert cette semaine.", 400);
        }

        scenarioResult = solveWithScenarios(solverInput, config, useManagerBrain);
      } else {
        const allInputs = await loadAllStoresSolverInput(weekStart, {
          mode, shiftDurationHours, shiftGranularity,
        });

        if (allInputs.length === 0) {
          return errorResponse("Aucun magasin avec des employés assignés.", 400);
        }

        scenarioResult = solveMultiStoreWithScenarios(allInputs, config, useManagerBrain);

        // Generate cross-store suggestions
        const suggestions = generateCrossStoreSuggestions(
          scenarioResult.best.result,
          allInputs
        );
        scenarioResult = { ...scenarioResult, suggestions };
      }

      result = scenarioResult.best.result;
    } else {
      // ─── Classic solver (backward compatible) ───
      if (storeId) {
        const store = await prisma.store.findUnique({ where: { id: storeId } });
        if (!store) return errorResponse("Magasin non trouvé", 404);

        const solverInput = await loadSolverInput(storeId, weekStart, {
          mode, shiftDurationHours, shiftGranularity,
        });

        if (solverInput.employees.length === 0) {
          return errorResponse("Aucun employé actif assigné à ce magasin.", 400);
        }
        if (solverInput.weekDays.length === 0) {
          return errorResponse("Aucun jour ouvert cette semaine.", 400);
        }

        result = solve(solverInput, { useManagerBrain });
      } else {
        const allInputs = await loadAllStoresSolverInput(weekStart, {
          mode, shiftDurationHours, shiftGranularity,
        });

        if (allInputs.length === 0) {
          return errorResponse("Aucun magasin avec des employés assignés.", 400);
        }

        result = solveMultiStore(allInputs, { useManagerBrain });
      }
    }

    // In preview mode, return the result
    if (mode === "preview") {
      if (scenarioResult) {
        return successResponse(scenarioResult);
      }
      return successResponse(result);
    }

    // In save mode, create all shifts in a transaction
    if (result.shifts.length === 0) {
      return successResponse({ ...result, message: "Aucun shift à enregistrer" });
    }

    const createdShifts = await prisma.$transaction(
      result.shifts.map((s) =>
        prisma.shift.create({
          data: {
            storeId: s.storeId,
            employeeId: s.employeeId || null,
            date: toUTCDate(s.date),
            startTime: s.startTime,
            endTime: s.endTime,
            note: s.employeeId
              ? `Auto-planifié — ${s.storeName}`
              : `Auto-planifié — ${s.storeName} — NON ASSIGNÉ`,
            assignmentReason: s.assignmentReason || null,
          },
        })
      )
    );

    await logAudit(session!.user.id, "CREATE", "Planning", storeId || "all", {
      action: "auto-generate",
      weekStart,
      multiStore: !storeId,
      useScenarios,
      useManagerBrain,
      shiftCount: createdShifts.length,
      totalHours: result.stats.totalHoursGenerated,
      ...(scenarioResult ? { scenarioScore: scenarioResult.best.score.total } : {}),
    });

    return successResponse({
      ...result,
      savedShiftIds: createdShifts.map((s) => s.id),
      message: `${createdShifts.length} shift(s) enregistré(s) avec succès`,
    });
  } catch (err) {
    console.error("POST /api/planning/generate error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

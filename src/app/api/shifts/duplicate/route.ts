import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { duplicateWeekSchema } from "@/lib/validations";
import { findOverlappingShift } from "@/lib/shifts";
import { logAudit } from "@/lib/audit";
import { getWeekBounds, toUTCDate } from "@/lib/utils";
import { dispatchNotificationAsync } from "@/lib/notifications/dispatcher";

// POST /api/shifts/duplicate - Duplicate a week of shifts
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const body = await req.json();
    const parsed = duplicateWeekSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { storeId, sourceWeekStart, targetWeekStart } = parsed.data;

    // Reject duplication if target store is inactive
    if (storeId) {
      const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, status: true } });
      if (!store) return errorResponse("Magasin non trouvé", 404);
      if (store.status !== "ACTIVE") return errorResponse("Impossible de dupliquer : ce magasin est inactif", 422);
    }

    const { weekStart: srcStart, weekEnd: srcEnd } = getWeekBounds(sourceWeekStart);
    const targetStart = toUTCDate(targetWeekStart);

    // Calculate day offset
    const dayOffset = Math.round(
      (targetStart.getTime() - srcStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get source shifts
    const where: Record<string, unknown> = {
      date: { gte: srcStart, lte: srcEnd },
    };
    if (storeId) where.storeId = storeId;

    const sourceShifts = await prisma.shift.findMany({
      where,
      include: { store: true },
    });

    if (sourceShifts.length === 0) {
      return errorResponse("Aucun shift à dupliquer pour cette semaine");
    }

    let skipped = 0;
    const conflicts: string[] = [];

    // M112 — on accumule d'abord les shifts à créer, puis on commit le tout en UNE
    // transaction (atomicité : pas de semaine à moitié dupliquée si une création échoue).
    // La dédup intra-lot (ci-dessous) préserve la sémantique séquentielle de l'ancienne
    // boucle (un shift cible en conflit avec un shift créé plus tôt dans le même lot).
    type NewShift = {
      storeId: string;
      employeeId: string | null;
      date: Date;
      startTime: string;
      endTime: string;
      note: string | null;
    };
    const toCreate: NewShift[] = [];
    const plannedUnassigned = new Set<string>();
    const plannedAssigned = new Map<string, Array<{ start: string; end: string }>>();
    const rangesOverlap = (aS: string, aE: string, bS: string, bE: string) => aS < bE && bS < aE;

    for (const shift of sourceShifts) {
      const newDate = new Date(shift.date);
      newDate.setUTCDate(newDate.getUTCDate() + dayOffset);
      const dateStr = newDate.toISOString().split("T")[0];

      // For unassigned shifts, check for existing unassigned shift at same time
      if (!shift.employeeId) {
        const key = `${shift.storeId}|${dateStr}|${shift.startTime}|${shift.endTime}`;
        const existingUnassigned = await prisma.shift.findFirst({
          where: {
            storeId: shift.storeId,
            date: new Date(dateStr),
            startTime: shift.startTime,
            endTime: shift.endTime,
            employeeId: null,
          },
        });
        if (existingUnassigned || plannedUnassigned.has(key)) {
          skipped++;
          conflicts.push(
            `${dateStr} ${shift.startTime}-${shift.endTime}: shift non assigné existant`
          );
          continue;
        }
        plannedUnassigned.add(key);
      } else {
        // Check for overlap before creating (assigned shifts) — DB + lot courant
        const overlap = await findOverlappingShift(
          shift.employeeId,
          dateStr,
          shift.startTime,
          shift.endTime
        );
        const mapKey = `${shift.employeeId}|${dateStr}`;
        const planned = plannedAssigned.get(mapKey) ?? [];
        const intraBatch = planned.some((p) => rangesOverlap(shift.startTime, shift.endTime, p.start, p.end));

        if (overlap || intraBatch) {
          skipped++;
          conflicts.push(
            `${dateStr} ${shift.startTime}-${shift.endTime}: conflit existant`
          );
          continue;
        }
        planned.push({ start: shift.startTime, end: shift.endTime });
        plannedAssigned.set(mapKey, planned);
      }

      toCreate.push({
        storeId: shift.storeId,
        employeeId: shift.employeeId,
        date: toUTCDate(dateStr),
        startTime: shift.startTime,
        endTime: shift.endTime,
        note: shift.note,
      });
    }

    if (toCreate.length > 0) {
      await prisma.$transaction(toCreate.map((data) => prisma.shift.create({ data })));
    }
    const created = toCreate.length;

    await logAudit(session!.user.id, "CREATE", "Shift", "bulk-duplicate", {
      sourceWeekStart,
      targetWeekStart,
      storeId,
      created,
      skipped,
    });

    // Notify assigned employees about the new planning
    if (created > 0) {
      const employeeIds = [...new Set(
        sourceShifts.filter((s) => s.employeeId).map((s) => s.employeeId!)
      )];
      if (employeeIds.length > 0) {
        const empUsers = await prisma.user.findMany({
          where: { employeeId: { in: employeeIds }, active: true },
          select: { id: true },
        });
        if (empUsers.length > 0) {
          dispatchNotificationAsync({
            userIds: empUsers.map((u) => u.id),
            eventType: "PLANNING_PUBLISHED",
            context: { weekStart: targetWeekStart },
          });
        }
      }
    }

    return successResponse({
      created,
      skipped,
      total: sourceShifts.length,
      conflicts,
    });
  } catch (err) {
    logger.error("POST /api/shifts/duplicate error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

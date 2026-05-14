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

    const user = session!.user as {
      id: string;
      role: string;
      companyId: string | null;
    };

    const body = await req.json();
    const parsed = duplicateWeekSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { storeId, sourceWeekStart, targetWeekStart } = parsed.data;

    // Reject duplication if target store is inactive
    let storeCompanyId: string | null = null;
    if (storeId) {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, status: true, companyId: true },
      });
      if (!store) return errorResponse("Magasin non trouvé", 404);
      if (store.status !== "ACTIVE") return errorResponse("Impossible de dupliquer : ce magasin est inactif", 422);
      storeCompanyId = store.companyId;

      // SaaS multi-tenant: cross-company check
      if (
        user.role !== "SUPER_ADMIN" &&
        user.companyId &&
        store.companyId &&
        store.companyId !== user.companyId
      ) {
        return errorResponse("Accès refusé : magasin hors de votre Company", 403);
      }
    }

    const { weekStart: srcStart, weekEnd: srcEnd } = getWeekBounds(sourceWeekStart);
    const targetStart = toUTCDate(targetWeekStart);

    // Calculate day offset
    const dayOffset = Math.round(
      (targetStart.getTime() - srcStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get source shifts — SaaS multi-tenant scoped
    const where: Record<string, unknown> = {
      date: { gte: srcStart, lte: srcEnd },
    };
    if (storeId) where.storeId = storeId;
    if (user.role !== "SUPER_ADMIN" && user.companyId) {
      where.companyId = user.companyId;
    }

    const sourceShifts = await prisma.shift.findMany({
      where,
      include: { store: true },
    });

    if (sourceShifts.length === 0) {
      return errorResponse("Aucun shift à dupliquer pour cette semaine");
    }

    let created = 0;
    let skipped = 0;
    const conflicts: string[] = [];

    for (const shift of sourceShifts) {
      const newDate = new Date(shift.date);
      newDate.setUTCDate(newDate.getUTCDate() + dayOffset);
      const dateStr = newDate.toISOString().split("T")[0];

      // For unassigned shifts, check for existing unassigned shift at same time
      if (!shift.employeeId) {
        const existingUnassigned = await prisma.shift.findFirst({
          where: {
            storeId: shift.storeId,
            date: new Date(dateStr),
            startTime: shift.startTime,
            endTime: shift.endTime,
            employeeId: null,
          },
        });
        if (existingUnassigned) {
          skipped++;
          conflicts.push(
            `${dateStr} ${shift.startTime}-${shift.endTime}: shift non assigné existant`
          );
          continue;
        }
      } else {
        // Check for overlap before creating (assigned shifts)
        const overlap = await findOverlappingShift(
          shift.employeeId,
          dateStr,
          shift.startTime,
          shift.endTime
        );

        if (overlap) {
          skipped++;
          conflicts.push(
            `${dateStr} ${shift.startTime}-${shift.endTime}: conflit existant`
          );
          continue;
        }
      }

      await prisma.shift.create({
        data: {
          storeId: shift.storeId,
          employeeId: shift.employeeId,
          date: toUTCDate(dateStr),
          startTime: shift.startTime,
          endTime: shift.endTime,
          note: shift.note,
          // SaaS multi-tenant: inherit companyId from the source shift
          // (or from the resolved store companyId, or user.companyId).
          companyId: shift.companyId ?? storeCompanyId ?? user.companyId ?? null,
        },
      });
      created++;
    }

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
    console.error("POST /api/shifts/duplicate error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { duplicateWeekSchema } from "@/lib/validations";
import { findOverlappingShift } from "@/lib/shifts";
import { logAudit } from "@/lib/audit";
import { getWeekBounds, toUTCDate } from "@/lib/utils";

// POST /api/shifts/duplicate - Duplicate a week of shifts
export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = duplicateWeekSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const { storeId, sourceWeekStart, targetWeekStart } = parsed.data;
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

  let created = 0;
  let skipped = 0;
  const conflicts: string[] = [];

  for (const shift of sourceShifts) {
    const newDate = new Date(shift.date);
    newDate.setUTCDate(newDate.getUTCDate() + dayOffset);
    const dateStr = newDate.toISOString().split("T")[0];

    // Check for overlap before creating
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

    await prisma.shift.create({
      data: {
        storeId: shift.storeId,
        employeeId: shift.employeeId,
        date: toUTCDate(dateStr),
        startTime: shift.startTime,
        endTime: shift.endTime,
        note: shift.note,
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

  return successResponse({
    created,
    skipped,
    total: sourceShifts.length,
    conflicts,
  });
}

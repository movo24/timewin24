import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { shiftUpdateSchema } from "@/lib/validations";
import { findOverlappingShift, calculateWeeklyHours } from "@/lib/shifts";
import { logAudit } from "@/lib/audit";
import { getWeekBounds, toUTCDate } from "@/lib/utils";

// PUT /api/shifts/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = shiftUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) return errorResponse("Shift non trouvé", 404);

  const { storeId, employeeId, date, startTime, endTime, note } = parsed.data;

  // Check overlap (exclude self)
  const overlap = await findOverlappingShift(
    employeeId,
    date,
    startTime,
    endTime,
    id
  );
  if (overlap) {
    return errorResponse(
      `Conflit: cet employé travaille déjà de ${overlap.startTime} à ${overlap.endTime} chez "${overlap.store.name}" ce jour-là`,
      409
    );
  }

  const shift = await prisma.shift.update({
    where: { id },
    data: {
      storeId,
      employeeId,
      date: toUTCDate(date),
      startTime,
      endTime,
      note: note || null,
    },
    include: {
      store: { select: { id: true, name: true } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          weeklyHours: true,
        },
      },
    },
  });

  await logAudit(session!.user.id, "UPDATE", "Shift", id, {
    before: existing,
    after: shift,
  });

  // Check weekly hours warning
  let weeklyHoursWarning: string | null = null;
  if (shift.employee.weeklyHours) {
    const { weekStart, weekEnd } = getWeekBounds(date);
    const totalHours = await calculateWeeklyHours(employeeId, weekStart, weekEnd);
    if (totalHours > shift.employee.weeklyHours) {
      weeklyHoursWarning = `Attention: ${shift.employee.firstName} ${shift.employee.lastName} totalise ${totalHours.toFixed(1)}h cette semaine (max: ${shift.employee.weeklyHours}h)`;
    }
  }

  return successResponse({ shift, weeklyHoursWarning });
}

// DELETE /api/shifts/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.shift.findUnique({
    where: { id },
    include: {
      store: { select: { name: true } },
      employee: { select: { firstName: true, lastName: true } },
    },
  });
  if (!existing) return errorResponse("Shift non trouvé", 404);

  await prisma.shift.delete({ where: { id } });
  await logAudit(session!.user.id, "DELETE", "Shift", id, {
    deleted: existing,
  });

  return successResponse({ success: true });
}

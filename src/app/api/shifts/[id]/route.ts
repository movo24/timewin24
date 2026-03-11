import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { shiftUpdateSchema } from "@/lib/validations";
import { findOverlappingShift, findStoreOverlapViolation, findStoreHoursViolation, findMaxEmployeesViolation, findMaxSimultaneousViolation, calculateWeeklyHours } from "@/lib/shifts";
import { logAudit } from "@/lib/audit";
import { getWeekBounds, toUTCDate } from "@/lib/utils";
import { dispatchNotificationAsync } from "@/lib/notifications/dispatcher";

// PUT /api/shifts/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireManagerOrAdmin();
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

  // Check overlap (only if employee is assigned, exclude self)
  if (employeeId) {
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
  }

  // Check store-level overlap policy
  const storeOverlap = await findStoreOverlapViolation(storeId, employeeId, date, startTime, endTime, id);
  if (storeOverlap) {
    return errorResponse(
      `Chevauchement interdit dans ce magasin (${storeOverlap.overlapMinutes} min avec un autre employé)`,
      409
    );
  }

  // Check store hours
  const hoursViolation = await findStoreHoursViolation(storeId, date, startTime, endTime);
  if (hoursViolation) {
    return errorResponse(hoursViolation.reason, 400);
  }

  // Check max employees per day
  const maxEmpViolation = await findMaxEmployeesViolation(storeId, date, employeeId, id);
  if (maxEmpViolation) {
    return errorResponse(maxEmpViolation.reason, 409);
  }

  // Check max simultaneous employees
  const simViolation = await findMaxSimultaneousViolation(storeId, date, startTime, endTime, id);
  if (simViolation) {
    return errorResponse(simViolation.reason, 409);
  }

  const shift = await prisma.shift.update({
    where: { id },
    data: {
      storeId,
      employeeId: employeeId || null,
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

  // Check weekly hours warning (only if employee is assigned)
  let weeklyHoursWarning: string | null = null;
  if (employeeId && shift.employee?.weeklyHours) {
    const { weekStart, weekEnd } = getWeekBounds(date);
    const totalHours = await calculateWeeklyHours(employeeId, weekStart, weekEnd);
    if (totalHours > shift.employee.weeklyHours) {
      weeklyHoursWarning = `Attention: ${shift.employee.firstName} ${shift.employee.lastName} totalise ${totalHours.toFixed(1)}h cette semaine (max: ${shift.employee.weeklyHours}h)`;
    }
  }

  // Notify employee if their shift was modified
  if (shift.employeeId) {
    const empUser = await prisma.user.findFirst({
      where: { employeeId: shift.employeeId, active: true },
      select: { id: true },
    });
    if (empUser) {
      dispatchNotificationAsync({
        userIds: [empUser.id],
        eventType: "PLANNING_MODIFIED",
        context: {
          storeName: shift.store.name,
          date,
          startTime,
          endTime,
        },
      });
    }
  }

  return successResponse({ shift, weeklyHoursWarning });
}

// DELETE /api/shifts/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireManagerOrAdmin();
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

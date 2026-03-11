import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionOrUnauthorized,
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { shiftCreateSchema } from "@/lib/validations";
import { findOverlappingShift, findStoreOverlapViolation, findStoreHoursViolation, findMaxEmployeesViolation, findMaxSimultaneousViolation, calculateWeeklyHours } from "@/lib/shifts";
import { logAudit } from "@/lib/audit";
import { getWeekBounds, toUTCDate } from "@/lib/utils";

// GET /api/shifts - Fetch shifts by store+week or employee+week
export async function GET(req: NextRequest) {
  const { session, error } = await getSessionOrUnauthorized();
  if (error) return error;

  const user = session!.user as { id: string; role: string; employeeId: string | null };
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId");
  const employeeId = searchParams.get("employeeId");
  const weekStart = searchParams.get("weekStart");

  if (!weekStart) return errorResponse("weekStart est requis");

  // Employee can only see their own shifts
  if (user.role === "EMPLOYEE") {
    if (!user.employeeId) return errorResponse("Aucun profil employé lié");

    const { weekStart: start, weekEnd: end } = getWeekBounds(weekStart);
    const shifts = await prisma.shift.findMany({
      where: {
        employeeId: user.employeeId,
        date: { gte: start, lte: end },
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            schedules: {
              select: { dayOfWeek: true, closed: true, openTime: true, closeTime: true, minEmployees: true, maxEmployees: true },
              orderBy: { dayOfWeek: "asc" as const },
            },
          },
        },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return successResponse({ shifts });
  }

  // Admin: filter by store or employee
  const { weekStart: start, weekEnd: end } = getWeekBounds(weekStart);
  const where: Record<string, unknown> = {
    date: { gte: start, lte: end },
  };
  if (storeId) where.storeId = storeId;
  if (employeeId) where.employeeId = employeeId;

  const shifts = await prisma.shift.findMany({
    where,
    include: {
      store: {
        select: {
          id: true,
          name: true,
          schedules: {
            select: { dayOfWeek: true, closed: true, openTime: true, closeTime: true, minEmployees: true, maxEmployees: true },
            orderBy: { dayOfWeek: "asc" as const },
          },
        },
      },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          weeklyHours: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return successResponse({ shifts });
}

// POST /api/shifts - Create a shift
export async function POST(req: NextRequest) {
  const { session, error } = await requireManagerOrAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = shiftCreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const { storeId, employeeId, date, startTime, endTime, note } = parsed.data;

  // Check overlap (only if employee is assigned)
  if (employeeId) {
    const overlap = await findOverlappingShift(employeeId, date, startTime, endTime);
    if (overlap) {
      return errorResponse(
        `Conflit: cet employé travaille déjà de ${overlap.startTime} à ${overlap.endTime} chez "${overlap.store.name}" ce jour-là`,
        409
      );
    }
  }

  // Check store-level overlap policy
  const storeOverlap = await findStoreOverlapViolation(storeId, employeeId, date, startTime, endTime);
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
  const maxEmpViolation = await findMaxEmployeesViolation(storeId, date, employeeId);
  if (maxEmpViolation) {
    return errorResponse(maxEmpViolation.reason, 409);
  }

  // Check max simultaneous employees
  const simViolation = await findMaxSimultaneousViolation(storeId, date, startTime, endTime);
  if (simViolation) {
    return errorResponse(simViolation.reason, 409);
  }

  const shift = await prisma.shift.create({
    data: {
      storeId,
      employeeId: employeeId || null,
      date: toUTCDate(date),
      startTime,
      endTime,
      note: note || null,
    },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          schedules: {
            select: { dayOfWeek: true, closed: true, openTime: true, closeTime: true, minEmployees: true, maxEmployees: true },
            orderBy: { dayOfWeek: "asc" as const },
          },
        },
      },
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

  await logAudit(session!.user.id, "CREATE", "Shift", shift.id, parsed.data);

  // Check weekly hours warning (only if employee is assigned)
  let weeklyHoursWarning: string | null = null;
  if (employeeId && shift.employee?.weeklyHours) {
    const { weekStart, weekEnd } = getWeekBounds(date);
    const totalHours = await calculateWeeklyHours(employeeId, weekStart, weekEnd);
    if (totalHours > shift.employee.weeklyHours) {
      weeklyHoursWarning = `Attention: ${shift.employee.firstName} ${shift.employee.lastName} totalise ${totalHours.toFixed(1)}h cette semaine (max: ${shift.employee.weeklyHours}h)`;
    }
  }

  return successResponse({ shift, weeklyHoursWarning }, 201);
}

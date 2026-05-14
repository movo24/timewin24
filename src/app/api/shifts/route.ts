import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionOrUnauthorized,
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { shiftCreateSchema } from "@/lib/validations";
import { findOverlappingShift, findStoreOverlapViolation, findStoreHoursViolation, findMaxEmployeesViolation, findMaxSimultaneousViolation, calculateWeeklyHours } from "@/lib/shifts";
import { logAudit } from "@/lib/audit";
import { getWeekBounds, toUTCDate } from "@/lib/utils";

// GET /api/shifts - Fetch shifts by store+week or employee+week
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await getSessionOrUnauthorized();
    if (error) return error;

    const user = session!.user as {
      id: string;
      role: string;
      employeeId: string | null;
      companyId: string | null;
    };
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");
    const employeeId = searchParams.get("employeeId");
    const weekStart = searchParams.get("weekStart");

    if (!weekStart) return errorResponse("weekStart est requis");

    // SaaS multi-tenant: companyId filter — SUPER_ADMIN bypass (platform scope)
    const tenantScope =
      user.role !== "SUPER_ADMIN" && user.companyId
        ? { companyId: user.companyId }
        : {};

    // Employee can only see their own shifts
    if (user.role === "EMPLOYEE") {
      if (!user.employeeId) return errorResponse("Aucun profil employé lié");

      const { weekStart: start, weekEnd: end } = getWeekBounds(weekStart);
      const shifts = await prisma.shift.findMany({
        where: {
          employeeId: user.employeeId,
          date: { gte: start, lte: end },
          ...tenantScope,
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

    // Admin/Manager/Owner: filter by store or employee
    const { weekStart: start, weekEnd: end } = getWeekBounds(weekStart);
    const where: Record<string, unknown> = {
      date: { gte: start, lte: end },
      // Never return shifts for inactive stores — they are locked
      store: { status: "ACTIVE" },
      ...tenantScope,
    };
    if (storeId) {
      // RBAC: Manager can only see shifts from their assigned stores
      if (user.role === "MANAGER") {
        const { storeIds } = await getAccessibleStoreIds();
        if (storeIds && !storeIds.includes(storeId)) {
          return errorResponse("Accès refusé à ce magasin", 403);
        }
      }
      where.storeId = storeId;
    } else if (user.role === "MANAGER") {
      // Manager without storeId filter: scope to their assigned stores
      const { storeIds } = await getAccessibleStoreIds();
      if (storeIds) where.storeId = { in: storeIds };
    }
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
  } catch (err) {
    console.error("GET /api/shifts error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// POST /api/shifts - Create a shift
export async function POST(req: NextRequest) {
  try {
  const { session, error } = await requireManagerOrAdmin();
  if (error) return error;

  const user = session!.user as {
    id: string;
    role: string;
    employeeId: string | null;
    companyId: string | null;
  };
  const body = await req.json();
  const parsed = shiftCreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const { storeId, employeeId, date, startTime, endTime, note } = parsed.data;

  // RBAC: Manager can only create shifts in their assigned stores
  if (user.role === "MANAGER") {
    const { storeIds } = await getAccessibleStoreIds();
    if (storeIds && !storeIds.includes(storeId)) {
      return errorResponse("Accès refusé : vous n'êtes pas assigné à ce magasin", 403);
    }
  }

  // Reject shift creation for inactive stores
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, status: true, companyId: true },
  });
  if (!store) return errorResponse("Magasin non trouvé", 404);
  if (store.status !== "ACTIVE") {
    return errorResponse("Impossible de créer un shift : ce magasin est inactif", 422);
  }

  // SaaS multi-tenant: cross-company check — non-SUPER_ADMIN cannot create
  // shifts in a store outside their Company.
  if (
    user.role !== "SUPER_ADMIN" &&
    user.companyId &&
    store.companyId &&
    store.companyId !== user.companyId
  ) {
    return errorResponse("Accès refusé : magasin hors de votre Company", 403);
  }

  // Verify employee is authorized for this store
  if (employeeId) {
    const authorization = await prisma.storeEmployee.findUnique({
      where: { storeId_employeeId: { storeId, employeeId } },
      select: { employeeId: true },
    });
    if (!authorization) {
      return errorResponse("Cet employé n'est pas autorisé sur ce magasin", 422);
    }
  }

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
      // SaaS multi-tenant: stamp companyId for tenant isolation.
      // Prefer the store's companyId (source of truth for the shift's scope).
      companyId: store.companyId ?? user.companyId ?? null,
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
  } catch (err) {
    console.error("POST /api/shifts error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

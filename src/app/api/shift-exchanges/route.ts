import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

/**
 * GET /api/shift-exchanges
 * List shift exchanges for the current user (employee sees own, admin sees all)
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuthenticated();
  if (error) return error;

  const user = session.user as { id: string; role: string; employeeId: string | null };
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  // Employees see only their own exchanges
  if (user.role === "EMPLOYEE" && user.employeeId) {
    where.OR = [
      { requesterId: user.employeeId },
      { targetId: user.employeeId },
    ];
  }

  // Filter by status
  if (status) {
    where.status = status;
  }

  const exchanges = await prisma.shiftExchange.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Load related shift & employee data
  const shiftIds = [
    ...exchanges.map((e) => e.requesterShiftId),
    ...exchanges.map((e) => e.targetShiftId).filter(Boolean) as string[],
  ];
  const employeeIds = [
    ...exchanges.map((e) => e.requesterId),
    ...exchanges.map((e) => e.targetId),
  ];

  const [shifts, employees] = await Promise.all([
    prisma.shift.findMany({
      where: { id: { in: shiftIds } },
      include: { store: { select: { id: true, name: true } } },
    }),
    prisma.employee.findMany({
      where: { id: { in: [...new Set(employeeIds)] } },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const enriched = exchanges.map((ex) => ({
    ...ex,
    requester: empMap.get(ex.requesterId) || null,
    target: empMap.get(ex.targetId) || null,
    requesterShift: shiftMap.get(ex.requesterShiftId) || null,
    targetShift: ex.targetShiftId ? shiftMap.get(ex.targetShiftId) || null : null,
  }));

  return successResponse({ exchanges: enriched });
}

/**
 * POST /api/shift-exchanges
 * Create a new shift exchange request (employee only)
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuthenticated();
  if (error) return error;

  const user = session.user as { id: string; role: string; employeeId: string | null };

  if (!user.employeeId) {
    return errorResponse("Aucun profil employé lié à ce compte.");
  }

  const body = await req.json();
  const { targetId, requesterShiftId, targetShiftId, message } = body as {
    targetId?: string;
    requesterShiftId?: string;
    targetShiftId?: string;
    message?: string;
  };

  if (!targetId || !requesterShiftId) {
    return errorResponse("targetId et requesterShiftId sont requis.");
  }

  // Verify requester owns the shift
  const requesterShift = await prisma.shift.findUnique({
    where: { id: requesterShiftId },
  });
  if (!requesterShift || requesterShift.employeeId !== user.employeeId) {
    return errorResponse("Ce shift ne vous appartient pas.");
  }

  // Verify target employee exists
  const targetEmployee = await prisma.employee.findUnique({
    where: { id: targetId },
  });
  if (!targetEmployee) {
    return errorResponse("Employé cible non trouvé.");
  }

  // Verify target shift if provided
  if (targetShiftId) {
    const targetShift = await prisma.shift.findUnique({
      where: { id: targetShiftId },
    });
    if (!targetShift || targetShift.employeeId !== targetId) {
      return errorResponse("Le shift cible n'appartient pas à cet employé.");
    }
  }

  // Check no pending exchange already exists for this shift
  const existing = await prisma.shiftExchange.findFirst({
    where: {
      requesterShiftId,
      status: { in: ["PENDING_PEER", "PENDING_MANAGER"] },
    },
  });
  if (existing) {
    return errorResponse("Un échange est déjà en cours pour ce shift.");
  }

  // Expiration: 48h
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  const exchange = await prisma.shiftExchange.create({
    data: {
      requesterId: user.employeeId,
      requesterShiftId,
      targetId,
      targetShiftId: targetShiftId || null,
      message: message || null,
      expiresAt,
    },
  });

  return successResponse({ exchange }, 201);
}

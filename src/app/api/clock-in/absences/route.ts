import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";

/**
 * GET /api/clock-in/absences — Détecter les absences
 * Retourne les shifts du jour qui n'ont pas de pointage associé
 * Params: ?date=YYYY-MM-DD&storeId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const storeId = searchParams.get("storeId");

    const dayStart = new Date(dateStr + "T00:00:00Z");
    const dayEnd = new Date(dateStr + "T23:59:59.999Z");

    // Get all shifts for the day with assigned employees
    const shifts = await prisma.shift.findMany({
      where: {
        date: { gte: dayStart, lte: dayEnd },
        employeeId: { not: { equals: null } },
        ...(storeId ? { storeId } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        store: { select: { id: true, name: true } },
        clockIn: { select: { id: true, clockInAt: true, status: true, lateMinutes: true } },
      },
      orderBy: [{ startTime: "asc" }],
    });

    // Separate into present (has clockIn) and absent (no clockIn)
    const absences = shifts
      .filter((s) => !s.clockIn)
      .map((s) => ({
        shiftId: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        employee: s.employee,
        store: s.store,
      }));

    return successResponse({ absences, totalShifts: shifts.length });
  } catch (err) {
    console.error("GET /api/clock-in/absences error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

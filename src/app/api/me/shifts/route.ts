import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthenticated, errorResponse, successResponse } from "@/lib/api-helpers";
import { getWeekBounds } from "@/lib/utils";

// GET /api/me/shifts — Get current employee's shifts (read-only)
// Params: weekStart (required), month (optional, format: YYYY-MM)
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuthenticated();
  if (error) return error;

  const user = session!.user as { id: string; role: string; employeeId: string | null };

  if (!user.employeeId) {
    return errorResponse("Aucun profil employé lié à ce compte", 400);
  }

  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  const month = searchParams.get("month"); // YYYY-MM

  let dateFilter: { gte: Date; lte: Date };

  if (month) {
    // Monthly view
    const [year, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 0)); // Last day of month
    dateFilter = { gte: start, lte: end };
  } else if (weekStart) {
    // Weekly view
    const bounds = getWeekBounds(weekStart);
    dateFilter = { gte: bounds.weekStart, lte: bounds.weekEnd };
  } else {
    return errorResponse("weekStart ou month est requis");
  }

  const shifts = await prisma.shift.findMany({
    where: {
      employeeId: user.employeeId,
      date: dateFilter,
    },
    include: {
      store: { select: { id: true, name: true, city: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  // Compute totals
  let totalHours = 0;
  for (const shift of shifts) {
    const [sh, sm] = shift.startTime.split(":").map(Number);
    const [eh, em] = shift.endTime.split(":").map(Number);
    totalHours += (eh * 60 + em - sh * 60 - sm) / 60;
  }

  return successResponse({
    shifts,
    totalHours: Math.round(totalHours * 100) / 100,
    shiftCount: shifts.length,
  });
}

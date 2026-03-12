import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { storeSchedulesBulkSchema } from "@/lib/validations";

// GET /api/stores/[id]/schedules
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) return errorResponse("Magasin non trouvé", 404);

    const schedules = await prisma.storeSchedule.findMany({
      where: { storeId: id },
      orderBy: { dayOfWeek: "asc" },
    });

    return successResponse(schedules);
  } catch (err) {
    console.error("GET /api/stores/[id]/schedules error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// PUT /api/stores/[id]/schedules — bulk upsert all 7 days
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) return errorResponse("Magasin non trouvé", 404);

    const body = await req.json();
    const parsed = storeSchedulesBulkSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    // Upsert each day schedule in a transaction
    const results = await prisma.$transaction(
      parsed.data.schedules.map((schedule) =>
        prisma.storeSchedule.upsert({
          where: {
            storeId_dayOfWeek: {
              storeId: id,
              dayOfWeek: schedule.dayOfWeek,
            },
          },
          update: {
            closed: schedule.closed,
            openTime: schedule.closed ? null : schedule.openTime,
            closeTime: schedule.closed ? null : schedule.closeTime,
            minEmployees: schedule.minEmployees,
            maxEmployees: schedule.maxEmployees,
            maxSimultaneous: schedule.maxSimultaneous,
          },
          create: {
            storeId: id,
            dayOfWeek: schedule.dayOfWeek,
            closed: schedule.closed,
            openTime: schedule.closed ? null : schedule.openTime,
            closeTime: schedule.closed ? null : schedule.closeTime,
            minEmployees: schedule.minEmployees,
            maxEmployees: schedule.maxEmployees,
            maxSimultaneous: schedule.maxSimultaneous,
          },
        })
      )
    );

    return successResponse(results);
  } catch (err) {
    console.error("PUT /api/stores/[id]/schedules error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

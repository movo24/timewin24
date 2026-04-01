import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api-helpers";
import { validatePosAuth } from "@/lib/pos-auth";

/**
 * GET /api/pos-feed/store-schedules?storeId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const authError = await validatePosAuth(req);
    if (authError) return authError;

    const storeId = new URL(req.url).searchParams.get("storeId");
    if (!storeId) return errorResponse("storeId requis");

    const schedules = await (prisma as any).storeSchedule.findMany({
      where: { storeId },
      orderBy: { dayOfWeek: "asc" },
    });

    return successResponse(schedules);
  } catch (err: any) {
    console.error("GET /api/pos-feed/store-schedules error:", err?.message);
    return errorResponse("Erreur chargement horaires: " + (err?.message || "inconnu"), 500);
  }
}

/**
 * PUT /api/pos-feed/store-schedules?storeId=xxx
 */
export async function PUT(req: NextRequest) {
  try {
    const authError = await validatePosAuth(req);
    if (authError) return authError;

    const storeId = new URL(req.url).searchParams.get("storeId");
    if (!storeId) return errorResponse("storeId requis");

    const body = await req.json();
    const schedules = body.schedules;
    if (!Array.isArray(schedules)) return errorResponse("schedules doit être un tableau");

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return errorResponse("Magasin introuvable", 404);

    const result = await (prisma as any).$transaction(
      schedules.map((s: any) =>
        (prisma as any).storeSchedule.upsert({
          where: { storeId_dayOfWeek: { storeId, dayOfWeek: s.dayOfWeek } },
          update: {
            closed: s.closed ?? false,
            openTime: s.openTime ?? "09:00",
            closeTime: s.closeTime ?? "20:00",
            minEmployees: s.minEmployees ?? null,
            maxEmployees: s.maxEmployees ?? null,
            maxSimultaneous: s.maxSimultaneous ?? null,
          },
          create: {
            storeId,
            dayOfWeek: s.dayOfWeek,
            closed: s.closed ?? false,
            openTime: s.openTime ?? "09:00",
            closeTime: s.closeTime ?? "20:00",
            minEmployees: s.minEmployees ?? null,
            maxEmployees: s.maxEmployees ?? null,
            maxSimultaneous: s.maxSimultaneous ?? null,
          },
        })
      )
    );

    return successResponse(result);
  } catch (err: any) {
    console.error("PUT /api/pos-feed/store-schedules error:", err?.message);
    return errorResponse("Erreur sauvegarde horaires: " + (err?.message || "inconnu"), 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api-helpers";
import { validatePosAuth } from "@/lib/pos-auth";

/**
 * GET /api/pos-feed/store-schedules?storeId=xxx
 * Returns operating hours for a store (7 days).
 * Auth: POS secret (same as other pos-feed endpoints).
 */
export async function GET(req: NextRequest) {
  const authError = await validatePosAuth(req);
  if (authError) return authError;

  const storeId = new URL(req.url).searchParams.get("storeId");
  if (!storeId) return errorResponse("storeId requis");

  const schedules = await prisma.storeSchedule.findMany({
    where: { storeId },
    orderBy: { dayOfWeek: "asc" },
  });

  return successResponse(schedules);
}

/**
 * PUT /api/pos-feed/store-schedules?storeId=xxx
 * Bulk upsert operating hours for a store (7 days).
 * Auth: POS secret.
 * Body: { schedules: [{ dayOfWeek, closed, openTime, closeTime }] }
 */
export async function PUT(req: NextRequest) {
  const authError = await validatePosAuth(req);
  if (authError) return authError;

  const storeId = new URL(req.url).searchParams.get("storeId");
  if (!storeId) return errorResponse("storeId requis");

  const body = await req.json();
  const schedules = body.schedules;
  if (!Array.isArray(schedules)) return errorResponse("schedules doit être un tableau");

  // Verify store exists
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return errorResponse("Magasin introuvable", 404);

  // Bulk upsert in transaction
  const result = await prisma.$transaction(
    schedules.map((s: any) =>
      prisma.storeSchedule.upsert({
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
}

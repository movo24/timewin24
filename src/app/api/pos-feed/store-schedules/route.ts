import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api-helpers";
import { validatePosAuth } from "@/lib/pos-auth";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const scheduleItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  closed: z.boolean().optional().default(false),
  openTime: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:mm").optional().default("09:00"),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:mm").optional().default("20:00"),
  minEmployees: z.number().int().min(0).max(100).nullable().optional().default(null),
  maxEmployees: z.number().int().min(0).max(100).nullable().optional().default(null),
  maxSimultaneous: z.number().int().min(0).max(100).nullable().optional().default(null),
});

const putBodySchema = z.object({
  schedules: z.array(scheduleItemSchema).min(1).max(7),
});

/**
 * GET /api/pos-feed/store-schedules?storeId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`posschedules:${ip}`, RATE_LIMITS.heavy);
    if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });

    const authError = await validatePosAuth(req);
    if (authError) return authError;

    const storeId = new URL(req.url).searchParams.get("storeId");
    if (!storeId) return errorResponse("storeId requis");

    const schedules = await (prisma as any).storeSchedule.findMany({
      where: { storeId },
      orderBy: { dayOfWeek: "asc" },
    });

    return successResponse(schedules);
  } catch (err) {
    console.error("GET /api/pos-feed/store-schedules error:", err);
    return errorResponse("Erreur chargement horaires", 500);
  }
}

/**
 * PUT /api/pos-feed/store-schedules?storeId=xxx
 */
export async function PUT(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`posschedules:${ip}`, RATE_LIMITS.heavy);
    if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });

    const authError = await validatePosAuth(req);
    if (authError) return authError;

    const storeId = new URL(req.url).searchParams.get("storeId");
    if (!storeId) return errorResponse("storeId requis");

    const body = await req.json();
    const parsed = putBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation: " + parsed.error.issues.map(i => i.message).join(", "), 400);
    }

    const { schedules } = parsed.data;

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return errorResponse("Magasin introuvable", 404);

    const result = await (prisma as any).$transaction(
      schedules.map((s) =>
        (prisma as any).storeSchedule.upsert({
          where: { storeId_dayOfWeek: { storeId, dayOfWeek: s.dayOfWeek } },
          update: {
            closed: s.closed,
            openTime: s.openTime,
            closeTime: s.closeTime,
            minEmployees: s.minEmployees,
            maxEmployees: s.maxEmployees,
            maxSimultaneous: s.maxSimultaneous,
          },
          create: {
            storeId,
            dayOfWeek: s.dayOfWeek,
            closed: s.closed,
            openTime: s.openTime,
            closeTime: s.closeTime,
            minEmployees: s.minEmployees,
            maxEmployees: s.maxEmployees,
            maxSimultaneous: s.maxSimultaneous,
          },
        })
      )
    );

    return successResponse(result);
  } catch (err) {
    console.error("PUT /api/pos-feed/store-schedules error:", err);
    return errorResponse("Erreur sauvegarde horaires", 500);
  }
}

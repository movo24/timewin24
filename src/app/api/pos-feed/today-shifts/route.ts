import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api-helpers";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";
import { validatePosAuth, assertPosStoreAccess } from "@/lib/pos-auth";

// GET /api/pos-feed/today-shifts?storeId=xxx
// Feed endpoint : le POS récupère les shifts planifiés du jour
// Auth : HMAC SHA-256 ou X-POS-Secret (legacy)
export async function GET(req: NextRequest) {
  // Rate limit: 20 per minute per IP (same as other POS feed endpoints)
  const ip = getClientIp(req);
  const rl = checkRateLimit(`heavy:${ip}:today-shifts`, RATE_LIMITS.heavy);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const authError = await validatePosAuth(req);
  if (authError) return authError;

  const storeId = new URL(req.url).searchParams.get("storeId");
  if (!storeId) return errorResponse("storeId requis");

  const scopeErr = await assertPosStoreAccess(req, storeId);
  if (scopeErr) return scopeErr;

  // Today's date in store timezone (simplified: UTC date)
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];
  const dateObj = new Date(dateStr + "T00:00:00Z");

  const shifts = await prisma.shift.findMany({
    where: {
      storeId,
      date: dateObj,
    },
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          // posPin: NEVER expose — auth credential
          posRole: true,
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return successResponse({
    date: dateStr,
    storeId,
    shifts: shifts.map((s) => ({
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      employee: s.employee,
    })),
  });
}

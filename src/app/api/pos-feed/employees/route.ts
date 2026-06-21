import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api-helpers";
import { toNumN } from "@/lib/decimal";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";
import { validatePosAuth } from "@/lib/pos-auth";

// GET /api/pos-feed/employees?storeId=xxx
// Feed endpoint : le POS interroge TimeWin24 pour obtenir la liste des caissiers
// Auth : HMAC SHA-256 ou X-POS-Secret (legacy)
export async function GET(req: NextRequest) {
  // Rate limit: 20 per minute (heavy endpoint)
  const ip = getClientIp(req);
  const rl = checkRateLimit(`posfeed:${ip}`, RATE_LIMITS.heavy);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const authError = await validatePosAuth(req);
  if (authError) return authError;

  const storeId = new URL(req.url).searchParams.get("storeId");
  if (!storeId) return errorResponse("storeId requis");

  // Get employees assigned to this store with POS-relevant fields
  const storeEmployees = await prisma.storeEmployee.findMany({
    where: { storeId },
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          email: true,
          active: true,
          // posPin: NEVER expose — auth credential
          // posQrCode: NEVER expose — auth credential
          posRole: true,
          maxDiscountPct: true,
          skills: true,
        },
      },
    },
  });

  const employees = storeEmployees
    .map((se) => se.employee)
    .filter((e) => e.active)
    .map((e) => ({ ...e, maxDiscountPct: toNumN(e.maxDiscountPct) })); // M101b

  return successResponse({ employees });
}

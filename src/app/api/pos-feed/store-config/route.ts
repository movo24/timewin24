import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api-helpers";
import { toNumN } from "@/lib/decimal";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";
import { validatePosAuth } from "@/lib/pos-auth";

// GET /api/pos-feed/store-config?storeId=xxx
// Feed endpoint : le POS récupère la config du magasin depuis TimeWin24
export async function GET(req: NextRequest) {
  // Rate limit: 20 per minute (heavy endpoint)
  const ip = getClientIp(req);
  const rl = checkRateLimit(`storeconfig:${ip}`, RATE_LIMITS.heavy);
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

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      schedules: true,
      unit: {
        select: {
          id: true,
          name: true,
          organization: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!store) return errorResponse("Magasin introuvable", 404);

  return successResponse({
    store: {
      id: store.id,
      name: store.name,
      storeCode: store.storeCode,
      status: store.status,
      city: store.city,
      address: store.address,
      country: store.country,
      timezone: store.timezone,
      currency: store.currency,
      vatRate: toNumN(store.vatRate),
      latitude: store.latitude,
      longitude: store.longitude,
      schedules: store.schedules,
      unit: store.unit,
    },
  });
}

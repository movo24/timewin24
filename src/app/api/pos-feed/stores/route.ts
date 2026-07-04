import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse } from "@/lib/api-helpers";
import { toNumN } from "@/lib/decimal";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";
import { validatePosAuth, posKeyStoreIds } from "@/lib/pos-auth";

// GET /api/pos-feed/stores
// Returns the ACTIVE stores linked to the calling POS key (périmètre clé).
// TimeWin24 is source of truth.
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`posstores:${ip}`, RATE_LIMITS.heavy);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const authError = await validatePosAuth(req);
  if (authError) return authError;

  // Périmètre : la clé ne voit que ses magasins liés (least-privilege).
  const keyId = req.headers.get("x-pos-key-id") ?? "";
  const allowedStoreIds = await posKeyStoreIds(keyId);

  const stores = await prisma.store.findMany({
    where: { status: "ACTIVE", id: { in: allowedStoreIds } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      storeCode: true,
      status: true,
      city: true,
      address: true,
      country: true,
      timezone: true,
      currency: true,
      vatRate: true,
      latitude: true,
      longitude: true,
      updatedAt: true,
    },
  });

  return successResponse({ stores: stores.map((s) => ({ ...s, vatRate: toNumN(s.vatRate) })), count: stores.length });
}

import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyInventoryToken } from "@/lib/inventory-jwt";

/**
 * POST /api/inventory/cleanup
 *
 * Two-phase cleanup:
 *   1. Purge idempotency keys older than 48h
 *   2. Abandon sessions IN_PROGRESS older than 12h
 *
 * Naturally idempotent: running it twice produces the same result.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyInventoryToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const IDEM_TTL_HOURS = 48;
  const SESSION_ABANDON_HOURS = 12;

  const idemCutoff = new Date(Date.now() - IDEM_TTL_HOURS * 60 * 60 * 1000);
  const sessionCutoff = new Date(
    Date.now() - SESSION_ABANDON_HOURS * 60 * 60 * 1000
  );

  try {
    // Phase 1: Purge old idempotency keys
    const purgedKeys = await prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: idemCutoff } },
    });

    // Phase 2: Abandon stale sessions
    // Only for the current store (scoped to auth context).
    // Sessions older than 12h that are still IN_PROGRESS → ABANDONED.
    // This is NOT a deletion — the session and its scans remain intact.
    const abandonedSessions = await prisma.inventorySession.updateMany({
      where: {
        storeId: auth.storeId,
        status: "IN_PROGRESS",
        startedAt: { lt: sessionCutoff },
      },
      data: {
        status: "ABANDONED",
        completedAt: new Date(),
      },
    });

    if (abandonedSessions.count > 0) {
      logger.debug(
        `[CLEANUP] Abandoned ${abandonedSessions.count} stale sessions for store=${auth.storeId} (older than ${SESSION_ABANDON_HOURS}h)`
      );
    }

    return NextResponse.json({
      idempotencyKeys: {
        purged: purgedKeys.count,
        cutoff: idemCutoff.toISOString(),
        ttlHours: IDEM_TTL_HOURS,
      },
      staleSessions: {
        abandoned: abandonedSessions.count,
        cutoff: sessionCutoff.toISOString(),
        abandonAfterHours: SESSION_ABANDON_HOURS,
      },
    });
  } catch (error) {
    logger.error("[CLEANUP] Failed:", error);
    return NextResponse.json(
      { error: "Erreur lors du nettoyage" },
      { status: 500 }
    );
  }
}

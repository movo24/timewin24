import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyInventoryToken } from "@/lib/inventory-jwt";

const ENDPOINT_ID = "POST /api/inventory/sessions";

// POST /api/inventory/sessions — Create a new inventory session (IDEMPOTENT)
//
// Règles :
//   1. X-Idempotency-Key obligatoire
//   2. 1 seule session IN_PROGRESS par employeeId+storeId
//      → si une existe déjà, elle est retournée (pas d'erreur, pas de doublon)
//   3. Idempotency 3 couches (lookup + transaction + UNIQUE DB)
//
export async function POST(req: NextRequest) {
  const auth = await verifyInventoryToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // ── Clé obligatoire ──
  const idempotencyKey = req.headers.get("x-idempotency-key")?.trim();

  if (!idempotencyKey || idempotencyKey.length === 0) {
    logger.warn(
      `[SESSIONS] Requête REJETÉE — X-Idempotency-Key absent | store=${auth.storeId} employee=${auth.employeeId}`
    );
    return NextResponse.json(
      {
        error: "Header X-Idempotency-Key obligatoire",
        code: "MISSING_IDEMPOTENCY_KEY",
      },
      { status: 400 }
    );
  }

  if (idempotencyKey.length > 255) {
    return NextResponse.json(
      { error: "X-Idempotency-Key trop long (max 255)" },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
  } catch {
    body = {};
  }

  // ═══════════════════════════════════════════════════════
  //  COUCHE 1 — Lookup idempotency rapide
  // ═══════════════════════════════════════════════════════
  try {
    const cached = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });

    if (cached) {
      logger.debug(
        `[IDEMPOTENCY] Session key "${idempotencyKey}" → replay`
      );
      return NextResponse.json(cached.response, {
        status: cached.statusCode,
        headers: {
          "X-Idempotency-Replay": "true",
          "X-Idempotency-Key": idempotencyKey,
        },
      });
    }
  } catch (e) {
    logger.error(`[IDEMPOTENCY] Lookup error: ${e}`);
  }

  // ═══════════════════════════════════════════════════════
  //  COUCHE 2 — Transaction atomique
  //  Inclut la règle métier : 1 session IN_PROGRESS max
  // ═══════════════════════════════════════════════════════
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Double-check idempotency dans la transaction
      const existingKey = await tx.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (existingKey) {
        return {
          type: "replay" as const,
          statusCode: existingKey.statusCode,
          response: existingKey.response,
        };
      }

      // ── RÈGLE MÉTIER : 1 session IN_PROGRESS max ──
      // Si l'employé a déjà une session ouverte dans ce magasin,
      // on la retourne directement. Pas d'erreur, pas de doublon.
      const existingSession = await tx.inventorySession.findFirst({
        where: {
          employeeId: auth.employeeId,
          storeId: auth.storeId,
          status: "IN_PROGRESS",
        },
        include: { _count: { select: { counts: true } } },
      });

      if (existingSession) {
        logger.debug(
          `[SESSIONS] Session IN_PROGRESS existante ${existingSession.id} pour employee=${auth.employeeId} store=${auth.storeId} → retournée`
        );

        // Stocker la clé d'idempotence pour ce résultat aussi
        await tx.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            endpoint: ENDPOINT_ID,
            storeId: auth.storeId,
            statusCode: 200,
            response: existingSession as object,
          },
        });

        return {
          type: "existing" as const,
          statusCode: 200,
          response: existingSession,
        };
      }

      // Créer la session
      const session = await tx.inventorySession.create({
        data: {
          storeId: auth.storeId,
          employeeId: auth.employeeId,
          notes: (body.notes as string) || null,
        },
        include: { _count: { select: { counts: true } } },
      });

      // Stocker la clé
      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          endpoint: ENDPOINT_ID,
          storeId: auth.storeId,
          statusCode: 201,
          response: session as object,
        },
      });

      return { type: "created" as const, statusCode: 201, response: session };
    });

    const headers: Record<string, string> = {
      "X-Idempotency-Key": idempotencyKey,
    };

    if (result.type === "replay") {
      headers["X-Idempotency-Replay"] = "true";
    } else if (result.type === "existing") {
      headers["X-Session-Reused"] = "true";
    } else {
      headers["X-Idempotency-Stored"] = "true";
    }

    return NextResponse.json(result.response, {
      status: result.statusCode,
      headers,
    });
  } catch (error: unknown) {
    // ═══════════════════════════════════════════════════════
    //  COUCHE 3 — P2002 sur IdempotencyKey PK = race rattrapée
    // ═══════════════════════════════════════════════════════
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      const cached = await prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (cached) {
        logger.debug(
          `[IDEMPOTENCY-DB] Session race caught for key="${idempotencyKey}"`
        );
        return NextResponse.json(cached.response, {
          status: cached.statusCode,
          headers: {
            "X-Idempotency-Replay": "true",
            "X-Idempotency-Key": idempotencyKey,
            "X-Duplicate-Detected": "true",
          },
        });
      }
    }

    logger.error("[SESSIONS] Create failed:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de la session" },
      { status: 500 }
    );
  }
}

// GET /api/inventory/sessions — List sessions for the store
//
// Supports query params:
//   ?status=IN_PROGRESS   — filter by status
//   ?admin=true           — admin view with age info
//
export async function GET(req: NextRequest) {
  const auth = await verifyInventoryToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const isAdmin = url.searchParams.get("admin") === "true";

  const where: Record<string, unknown> = { storeId: auth.storeId };
  if (statusFilter) {
    where.status = statusFilter;
  }

  const sessions = await prisma.inventorySession.findMany({
    where,
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      _count: { select: { counts: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  if (isAdmin) {
    const now = new Date();
    const enriched = sessions.map((s) => ({
      ...s,
      ageMinutes: Math.round(
        (now.getTime() - new Date(s.startedAt).getTime()) / 60000
      ),
      ageHours: Math.round(
        (now.getTime() - new Date(s.startedAt).getTime()) / 3600000 * 10
      ) / 10,
    }));
    return NextResponse.json({ sessions: enriched });
  }

  return NextResponse.json({ sessions });
}

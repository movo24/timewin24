import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyInventoryToken } from "@/lib/inventory-jwt";

// ─── CONSTANTS ───────────────────────────
const ENDPOINT_ID = "POST /api/inventory/scan";

// ─── POST /api/inventory/scan — Record a barcode scan (IDEMPOTENT) ───
//
// X-Idempotency-Key est OBLIGATOIRE.
//
// 3 couches de protection anti-duplication :
//
// Couche 1 : X-Idempotency-Key → lookup rapide dans IdempotencyKey → replay 200
// Couche 2 : Transaction SQL atomique → insert scan + insert clé → commit unique
// Couche 3 : UNIQUE(idempotencyKey) sur InventoryCount → dernier rempart DB
//
// La contrainte porte sur une identité TECHNIQUE (idempotencyKey),
// jamais sur une combinaison MÉTIER (barcode+quantity).
// Un employé peut rescanner le même produit à la même quantité — c'est un acte métier légitime.
//
export async function POST(req: NextRequest) {
  const auth = await verifyInventoryToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // ── Extract Idempotency Key (OBLIGATOIRE) ──
  const idempotencyKey = req.headers.get("x-idempotency-key")?.trim();

  if (!idempotencyKey || idempotencyKey.length === 0) {
    logger.warn(
      `[SCAN] Requête REJETÉE — X-Idempotency-Key absent | store=${auth.storeId} employee=${auth.employeeId}`
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

  // ── Parse Body ──
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Corps JSON invalide (objet attendu)" },
        { status: 400 }
      );
    }
    body = parsed;
  } catch {
    return NextResponse.json(
      { error: "Corps JSON invalide" },
      { status: 400 }
    );
  }

  const { sessionId, barcode, productName, quantity } = body as {
    sessionId?: string;
    barcode?: string;
    productName?: string;
    quantity?: number;
  };

  if (!sessionId || !barcode) {
    return NextResponse.json(
      { error: "sessionId et barcode requis" },
      { status: 400 }
    );
  }

  // ═══════════════════════════════════════════════════════
  //  COUCHE 1 — Lookup rapide par X-Idempotency-Key
  // ═══════════════════════════════════════════════════════
  try {
    const cached = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });

    if (cached) {
      logger.debug(
        `[IDEMPOTENCY] Key "${idempotencyKey}" already processed → replay`
      );
      return NextResponse.json(cached.response, {
        status: cached.statusCode,
        headers: {
          "X-Idempotency-Replay": "true",
          "X-Idempotency-Key": idempotencyKey,
        },
      });
    }
  } catch (lookupError) {
    // Fail-open : si le lookup échoue, on continue normalement
    logger.error(
      `[IDEMPOTENCY] Lookup error for "${idempotencyKey}":`,
      lookupError
    );
  }

  // ── Verify session belongs to this store ──
  const session = await prisma.inventorySession.findFirst({
    where: { id: sessionId, storeId: auth.storeId, status: "IN_PROGRESS" },
  });

  if (!session) {
    const errorResp = { error: "Session introuvable ou terminée" };
    await safeStoreIdempotency(idempotencyKey, auth.storeId, 404, errorResp);
    return NextResponse.json(errorResp, { status: 404 });
  }

  // ── Sanitize inputs ──
  const safeQty = Math.max(
    1,
    Math.min(Math.floor(Number(quantity) || 1), 2147483647)
  );
  const safeBarcode = barcode.replace(/\x00/g, "").slice(0, 500);
  const safeName = productName?.replace(/\x00/g, "").slice(0, 500) || null;

  // ═══════════════════════════════════════════════════════
  //  COUCHE 2 — Transaction atomique
  //  Insert scan + insert clé idempotency → commit unique
  // ═══════════════════════════════════════════════════════
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Double-check idempotency DANS la transaction (protection race condition)
      const existingInTx = await tx.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (existingInTx) {
        return {
          replay: true,
          statusCode: existingInTx.statusCode,
          response: existingInTx.response,
        };
      }

      // Insert le scan avec la clé technique
      const count = await tx.inventoryCount.create({
        data: {
          sessionId,
          barcode: safeBarcode,
          productName: safeName,
          quantity: safeQty,
          idempotencyKey,
        },
      });

      // Stocker la clé idempotency avec la réponse complète
      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          endpoint: ENDPOINT_ID,
          storeId: auth.storeId,
          statusCode: 201,
          response: count as object,
        },
      });

      return { replay: false, statusCode: 201, response: count };
    });

    if (result.replay) {
      logger.debug(
        `[IDEMPOTENCY] Key "${idempotencyKey}" resolved in transaction (race caught)`
      );
      return NextResponse.json(result.response, {
        status: result.statusCode,
        headers: {
          "X-Idempotency-Replay": "true",
          "X-Idempotency-Key": idempotencyKey,
        },
      });
    }

    return NextResponse.json(result.response, {
      status: 201,
      headers: {
        "X-Idempotency-Key": idempotencyKey,
        "X-Idempotency-Stored": "true",
      },
    });
  } catch (error: unknown) {
    // ═══════════════════════════════════════════════════════
    //  COUCHE 3 — UNIQUE(idempotencyKey) sur InventoryCount
    //  Dernier rempart DB : identité technique, pas métier
    // ═══════════════════════════════════════════════════════
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      const existing = await prisma.inventoryCount.findFirst({
        where: { idempotencyKey },
      });

      if (existing) {
        logger.debug(
          `[IDEMPOTENCY-DB] Unique constraint caught duplicate for key="${idempotencyKey}"`
        );

        // Stocker aussi dans IdempotencyKey pour accélérer les prochains lookups
        await safeStoreIdempotency(
          idempotencyKey,
          auth.storeId,
          200,
          existing as object
        );

        return NextResponse.json(existing, {
          status: 200,
          headers: {
            "X-Idempotency-Replay": "true",
            "X-Idempotency-Key": idempotencyKey,
            "X-Duplicate-Detected": "true",
          },
        });
      }

      logger.error(
        "[SCAN] P2002 but no matching record found:",
        error
      );
      return NextResponse.json(
        { error: "Conflit de données" },
        { status: 409 }
      );
    }

    logger.error("[SCAN] Create failed:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement du scan" },
      { status: 500 }
    );
  }
}

// ─── GET /api/inventory/scan?sessionId=xxx — Get all scans for a session ───
export async function GET(req: NextRequest) {
  const auth = await verifyInventoryToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId requis" }, { status: 400 });
  }

  const session = await prisma.inventorySession.findFirst({
    where: { id: sessionId, storeId: auth.storeId },
  });

  if (!session) {
    return NextResponse.json(
      { error: "Session introuvable" },
      { status: 404 }
    );
  }

  const counts = await prisma.inventoryCount.findMany({
    where: { sessionId },
    orderBy: { scannedAt: "desc" },
  });

  return NextResponse.json({ counts, total: counts.length });
}

// ─── Helper: Stockage idempotency non-bloquant ───
async function safeStoreIdempotency(
  key: string,
  storeId: string,
  statusCode: number,
  response: object
) {
  try {
    await prisma.idempotencyKey.upsert({
      where: { key },
      create: {
        key,
        endpoint: ENDPOINT_ID,
        storeId,
        statusCode,
        response,
      },
      update: {},
    });
  } catch (e) {
    logger.error(`[IDEMPOTENCY] Failed to store key "${key}":`, e);
  }
}

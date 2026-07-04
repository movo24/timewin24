import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyInventoryToken } from "@/lib/inventory-jwt";

// GET /api/inventory/history — Completed sessions for this store
export async function GET(req: NextRequest) {
  const auth = await verifyInventoryToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const sessions = await prisma.inventorySession.findMany({
    where: { storeId: auth.storeId, status: "COMPLETED" },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      _count: { select: { counts: true } },
    },
    orderBy: { completedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ sessions });
}

// PATCH /api/inventory/history — Complete or cancel a session
//
// Naturellement idempotent :
//   - filtre sur status: IN_PROGRESS → si déjà terminée, retourne 404
//   - un retry après succès = 404 (pas d'effet secondaire)
//
// Pas de X-Idempotency-Key requis.
//
// Protection supplémentaire : transaction pour éliminer la micro-fenêtre
// de race entre findFirst et update.
//
// Effets secondaires vérifiés :
//   - aucune notification
//   - aucun webhook
//   - aucun recalcul
//   - aucun log d'audit externe
//   - completedAt fixé une seule fois (2ème appel = 404)
//
export async function PATCH(req: NextRequest) {
  const auth = await verifyInventoryToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Corps JSON invalide" },
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

  const { sessionId, action } = body as {
    sessionId?: string;
    action?: string;
  };

  if (!sessionId || !["complete", "cancel"].includes(action || "")) {
    return NextResponse.json(
      { error: "sessionId et action (complete|cancel) requis" },
      { status: 400 }
    );
  }

  // Transaction pour éliminer la race condition findFirst → update
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const session = await tx.inventorySession.findFirst({
        where: {
          id: sessionId,
          storeId: auth.storeId,
          status: "IN_PROGRESS",
        },
      });

      if (!session) {
        return null; // déjà terminée ou introuvable
      }

      return tx.inventorySession.update({
        where: { id: sessionId },
        data: {
          status: action === "complete" ? "COMPLETED" : "CANCELLED",
          completedAt: new Date(),
        },
        include: { _count: { select: { counts: true } } },
      });
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Session introuvable ou déjà terminée" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    logger.error("[HISTORY] PATCH failed:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de la session" },
      { status: 500 }
    );
  }
}

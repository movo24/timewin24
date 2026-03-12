import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { toUTCDate } from "@/lib/utils";

/**
 * POST /api/shifts/cancel-week
 *
 * Supprime tous les shifts d'une semaine donnée.
 * Si storeId est fourni : supprime uniquement les shifts de ce magasin.
 * Si storeId est vide : supprime les shifts de TOUS les magasins.
 *
 * Body: { weekStart: "YYYY-MM-DD", storeId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const body = await req.json();
    const { weekStart, storeId } = body;

    if (!weekStart || typeof weekStart !== "string") {
      return errorResponse("weekStart est obligatoire");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return errorResponse("Format de date invalide (YYYY-MM-DD attendu)");
    }

    // Calculate week bounds (Monday → Sunday)
    const monday = toUTCDate(weekStart);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);

    // Build where clause
    const where: {
      date: { gte: Date; lte: Date };
      storeId?: string;
    } = {
      date: {
        gte: monday,
        lte: sunday,
      },
    };

    if (storeId) {
      where.storeId = storeId;
    }

    // Count shifts to delete
    const count = await prisma.shift.count({ where });

    if (count === 0) {
      return successResponse({
        deleted: 0,
        message: "Aucun shift à supprimer cette semaine",
      });
    }

    // Delete all matching shifts
    const result = await prisma.shift.deleteMany({ where });

    // Audit log
    await logAudit(session!.user.id, "DELETE", "Planning", storeId || "all", {
      action: "cancel-week",
      weekStart,
      storeId: storeId || "all",
      deletedCount: result.count,
    });

    return successResponse({
      deleted: result.count,
      message: `${result.count} shift(s) supprimé(s)`,
    });
  } catch (err) {
    console.error("POST /api/shifts/cancel-week error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

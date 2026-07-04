import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { serializeStoreVat } from "@/lib/money-serialize";
import { storeUpdateSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

// GET /api/stores/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        employees: { include: { employee: true } },
        schedules: { orderBy: { dayOfWeek: "asc" } },
        _count: { select: { shifts: true } },
      },
    });

    if (!store) return errorResponse("Magasin non trouvé", 404);
    return successResponse(serializeStoreVat(store));
  } catch (err) {
    logger.error("GET /api/stores/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// PUT /api/stores/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const parsed = storeUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) return errorResponse("Magasin non trouvé", 404);

    const store = await prisma.store.update({ where: { id }, data: parsed.data });
    await logAudit(session!.user.id, "UPDATE", "Store", id, {
      before: existing,
      after: store,
    });

    return successResponse(serializeStoreVat(store));
  } catch (err) {
    logger.error("PUT /api/stores/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// DELETE /api/stores/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) return errorResponse("Magasin non trouvé", 404);

    await prisma.store.delete({ where: { id } });
    await logAudit(session!.user.id, "DELETE", "Store", id, { deleted: existing });

    return successResponse({ success: true });
  } catch (err) {
    // M111: FK RESTRICT — historique présent (shifts, pointages…)
    if ((err as { code?: string }).code === "P2003") {
      return errorResponse(
        "Ce magasin a un historique (shifts, pointages) et ne peut pas être supprimé. Désactivez-le à la place.",
        409
      );
    }
    logger.error("DELETE /api/stores/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

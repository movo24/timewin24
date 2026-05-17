import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// POST /api/accounts/[id]/toggle — Activate/deactivate a user account
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const requester = session!.user as { id: string; role: string; companyId: string | null };
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, active: true, role: true, companyId: true },
    });
    if (!user) return errorResponse("Compte introuvable", 404);

    // SaaS multi-tenant: cross-company forbidden
    if (
      requester.role !== "SUPER_ADMIN" &&
      requester.companyId &&
      user.companyId &&
      user.companyId !== requester.companyId
    ) {
      return errorResponse("Accès refusé : compte hors de votre Company", 403);
    }

    // Prevent deactivating own admin account
    if (user.id === session!.user.id) {
      return errorResponse("Impossible de désactiver votre propre compte", 400);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { active: !user.active },
      select: { id: true, active: true, name: true, email: true },
    });

    await logAudit(session!.user.id, "UPDATE", "UserAccount", id, {
      action: user.active ? "deactivate" : "activate",
    });

    return successResponse(updated);
  } catch (err) {
    console.error("POST /api/accounts/[id]/toggle error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

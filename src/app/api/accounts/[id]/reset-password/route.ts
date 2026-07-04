import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const resetSchema = z.object({
  newPassword: z.string().min(8, "Mot de passe min. 8 caractères"),
});

// POST /api/accounts/[id]/reset-password — Admin resets an employee's password
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) return errorResponse("Compte introuvable", 404);

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        mustChangePassword: true, // Forcer le changement à la prochaine connexion
        passwordChangedAt: new Date(),
      },
    });

    await logAudit(session!.user.id, "UPDATE", "UserAccount", id, {
      action: "password_reset",
    });

    return successResponse({ message: "Mot de passe réinitialisé" });
  } catch (err) {
    logger.error("POST /api/accounts/[id]/reset-password error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

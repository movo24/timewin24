import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthenticated, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z.string().min(8, "Le nouveau mot de passe doit faire au moins 8 caractères"),
  confirmPassword: z.string().min(1, "Confirmation requise"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "Le nouveau mot de passe doit être différent de l'ancien",
  path: ["newPassword"],
});

// POST /api/me/change-password — Changer son propre mot de passe
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuthenticated();
  if (error) return error;

  const body = await req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { id: true, passwordHash: true },
  });

  if (!user) return errorResponse("Utilisateur introuvable", 404);

  // Vérifier l'ancien mot de passe
  const isValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!isValid) {
    return errorResponse("Mot de passe actuel incorrect");
  }

  // Mettre à jour le mot de passe + désactiver mustChangePassword
  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
    },
  });

  await logAudit(session!.user.id, "UPDATE", "UserAccount", user.id, {
    action: "password_changed_by_user",
  });

  return successResponse({ message: "Mot de passe modifié avec succès" });
}

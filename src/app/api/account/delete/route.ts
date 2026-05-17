/**
 * POST /api/account/delete
 *
 * Suppression du compte utilisateur connecté (RGPD + Apple App Store requirement).
 *
 * Comportement selon le rôle :
 *   - OWNER  → soft-delete la Company entière (Company.deletedAt + cascade SET NULL)
 *              + suppression du User OWNER.
 *   - ADMIN / MANAGER / EMPLOYEE → suppression du User uniquement.
 *              L'Employee lié (s'il existe) est conservé pour l'historique RH
 *              (le manager reste tracé dans les shifts, audit logs, etc.).
 *
 * Sécurité :
 *   - SUPER_ADMIN : INTERDIT via cette route (passer par admin platforme).
 *   - Confirmation requise : body { confirm: true } + password (bcrypt verify).
 *   - Audit log conservé (companyId préservé sur PlanningNotification, AuditLog
 *     grâce à ON DELETE SET NULL — voir Phase 1 schema).
 *
 * Required by Apple Store guidelines (2022+): users MUST be able to initiate
 * account deletion from within the app, with no support email loop.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireFlag } from "@/lib/feature-flags";
import bcrypt from "bcryptjs";
import { z } from "zod";

const deleteSchema = z.object({
  confirm: z.literal(true, { message: "Confirmation requise" }),
  password: z.string().min(1, "Mot de passe requis pour confirmer"),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  // SaaS App Store guideline mandates this endpoint be available in the app
  const off = requireFlag("accountDeletion");
  if (off) return off;

  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const sessionUser = session!.user as {
      id: string;
      role: string;
      email: string;
      companyId: string | null;
    };

    // SUPER_ADMIN cannot self-delete via this route (platform admin must do it manually)
    if (sessionUser.role === "SUPER_ADMIN") {
      return errorResponse(
        "Les comptes SUPER_ADMIN ne peuvent pas être supprimés via cette interface. Contactez le support TimeWin24.",
        403
      );
    }

    const body = await req.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    // Verify password (re-authentication for security)
    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, passwordHash: true, role: true, companyId: true, employeeId: true },
    });
    if (!dbUser) return errorResponse("Compte introuvable", 404);

    const passwordOK = await bcrypt.compare(parsed.data.password, dbUser.passwordHash);
    if (!passwordOK) {
      return errorResponse("Mot de passe incorrect", 401);
    }

    // ─── OWNER → soft-delete the entire Company ──────────────────────────
    if (dbUser.role === "OWNER" && dbUser.companyId) {
      const companyId = dbUser.companyId;

      // Audit before deletion (so we have a trace of who/why)
      await logAudit(
        sessionUser.id,
        "DELETE",
        "Company",
        companyId,
        {
          action: "owner_account_deletion",
          ownerEmail: sessionUser.email,
          reason: parsed.data.reason ?? null,
          deletedAt: new Date().toISOString(),
        }
      );

      // Soft-delete the Company (preserve audit FK via SET NULL on delete)
      await prisma.company.update({
        where: { id: companyId },
        data: {
          status: "DELETED",
          deletedAt: new Date(),
        },
      });

      // Hard-delete only the User account (cascade-safe per schema)
      await prisma.user.delete({ where: { id: dbUser.id } });

      return successResponse({
        message: "Votre compte propriétaire et votre Company ont été supprimés. " +
          "Vos données opérationnelles (shifts, employés, audit) sont conservées " +
          "en lecture seule pour des raisons légales et seront purgées sous 30 jours.",
        scope: "company",
        companyId,
        timing: "soft-delete (purge complète sous 30 jours)",
      });
    }

    // ─── ADMIN / MANAGER / EMPLOYEE → delete only the User account ────────
    await logAudit(
      sessionUser.id,
      "DELETE",
      "User",
      dbUser.id,
      {
        action: "self_account_deletion",
        role: dbUser.role,
        email: sessionUser.email,
        reason: parsed.data.reason ?? null,
        deletedAt: new Date().toISOString(),
      }
    );

    await prisma.user.delete({ where: { id: dbUser.id } });

    return successResponse({
      message: "Votre compte a été supprimé. Vos données opérationnelles (shifts, " +
        "présences, audit) sont conservées pour des raisons légales et liées à " +
        "votre employeur. Pour une suppression complète, contactez votre employeur.",
      scope: "user",
      role: dbUser.role,
    });
  } catch (err) {
    console.error("POST /api/account/delete error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

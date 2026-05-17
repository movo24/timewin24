/**
 * POST /api/onboarding/complete
 *
 * Étape finale : marque l'onboarding comme terminé (Company.onboardingStep = 99).
 * Vérifie que les 3 étapes préalables sont OK (nom Company, ≥1 store, ≥1 employé).
 */
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { requireFlag } from "@/lib/feature-flags";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const off = requireFlag("onboarding");
  if (off) return off;

  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;
    const user = session!.user as {
      id: string;
      role: string;
      companyId: string | null;
    };

    if (user.role !== "OWNER") {
      return errorResponse(
        "Seul le propriétaire (OWNER) peut finaliser l'onboarding",
        403
      );
    }
    if (!user.companyId) {
      return errorResponse("Compte sans Company assignée", 403);
    }

    // Vérifier que les 3 étapes sont OK
    const [company, storeCount, employeeCount] = await Promise.all([
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { id: true, name: true, onboardingStep: true },
      }),
      prisma.store.count({ where: { companyId: user.companyId } }),
      prisma.employee.count({ where: { companyId: user.companyId } }),
    ]);

    if (!company) return errorResponse("Company introuvable", 404);

    const missing: string[] = [];
    if (!company.name?.trim()) missing.push("informations de la société");
    if (storeCount === 0) missing.push("au moins un site");
    if (employeeCount === 0) missing.push("au moins un employé");

    if (missing.length > 0) {
      return errorResponse(
        `Onboarding incomplet — il manque : ${missing.join(", ")}`,
        400
      );
    }

    const updated = await prisma.company.update({
      where: { id: user.companyId },
      data: { onboardingStep: 99 },
    });

    await logAudit(user.id, "UPDATE", "Company", user.companyId, {
      action: "onboarding_complete",
      stores: storeCount,
      employees: employeeCount,
    });

    return successResponse({
      company: updated,
      message: "Onboarding terminé. Bienvenue sur TimeWin24.",
    });
  } catch (err) {
    console.error("POST /api/onboarding/complete error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

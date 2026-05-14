/**
 * POST /api/onboarding/company
 *
 * Étape 1 de l'onboarding : crée/met à jour les informations de la Company.
 * Seul l'OWNER peut faire cette étape.
 *
 * Marque Company.onboardingStep = 1 si succès.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { requireFlag } from "@/lib/feature-flags";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const onboardingCompanySchema = z.object({
  name: z.string().min(1, "Nom requis").max(120),
  country: z.string().length(2).default("FR"),
  timezone: z.string().min(1, "Fuseau horaire requis").default("Europe/Paris"),
  language: z.string().min(2).max(5).default("fr"),
  contactEmail: z.string().email().optional().nullable(),
});

export async function POST(req: NextRequest) {
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
        "Seul le propriétaire (OWNER) peut effectuer l'onboarding",
        403
      );
    }

    if (!user.companyId) {
      return errorResponse("Compte sans Company assignée", 403);
    }

    const body = await req.json();
    const parsed = onboardingCompanySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const updated = await prisma.company.update({
      where: { id: user.companyId },
      data: {
        name: parsed.data.name,
        country: parsed.data.country,
        timezone: parsed.data.timezone,
        language: parsed.data.language,
        contactEmail: parsed.data.contactEmail ?? null,
        onboardingStep: Math.max(1, 0), // step 1 done
      },
    });

    await logAudit(user.id, "UPDATE", "Company", user.companyId, {
      action: "onboarding_step_company",
      ...parsed.data,
    });

    return successResponse({
      company: updated,
      nextStep: "stores",
    });
  } catch (err) {
    console.error("POST /api/onboarding/company error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

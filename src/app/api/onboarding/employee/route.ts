/**
 * POST /api/onboarding/employee
 *
 * Étape 3 de l'onboarding : crée le premier employé.
 *
 * Body: { firstName, lastName, email, phone?, storeId, weeklyHours?, role? }
 * Marque Company.onboardingStep = 3 si succès.
 *
 * Note : on NE crée PAS le User (compte de connexion) ici — c'est juste
 *        la fiche employé. Le User pourra être créé après si l'employé
 *        doit se connecter à l'app.
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

const onboardingEmployeeSchema = z.object({
  firstName: z.string().min(1, "Prénom requis").max(80),
  lastName: z.string().min(1, "Nom requis").max(80),
  email: z.string().email().optional().nullable(),
  storeId: z.string().min(1, "Site requis"),
  weeklyHours: z.number().min(0).max(60).optional().nullable(),
  contractType: z.enum(["CDI", "CDD", "INTERIM", "EXTRA", "STAGE"]).optional().nullable(),
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
    const parsed = onboardingEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const companyId = user.companyId;

    // Vérif que le store appartient bien à la Company
    const store = await prisma.store.findUnique({
      where: { id: parsed.data.storeId },
      select: { id: true, companyId: true },
    });
    if (!store) return errorResponse("Site introuvable", 404);
    if (store.companyId !== companyId) {
      return errorResponse("Site hors de votre Company", 403);
    }

    // Check email unicité si fourni
    if (parsed.data.email) {
      const existing = await prisma.employee.findUnique({
        where: { email: parsed.data.email },
      });
      if (existing) {
        return errorResponse("Un employé avec cet email existe déjà", 409);
      }
    }

    const employee = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email ?? null,
          weeklyHours: parsed.data.weeklyHours ?? null,
          contractType: parsed.data.contractType ?? null,
          active: true,
          priority: 1,
          shiftPreference: "JOURNEE",
          companyId,
        },
      });

      // Lien store ↔ employee
      await tx.storeEmployee.create({
        data: {
          storeId: parsed.data.storeId,
          employeeId: emp.id,
          companyId,
        },
      });

      // Mark onboarding step 3 done (on ne passe à 99 qu'avec /complete)
      await tx.company.update({
        where: { id: companyId },
        data: { onboardingStep: 3 },
      });

      return emp;
    });

    await logAudit(user.id, "CREATE", "Employee", employee.id, {
      action: "onboarding_step_employee",
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
    });

    return successResponse({
      employee,
      nextStep: "done",
    });
  } catch (err) {
    console.error("POST /api/onboarding/employee error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

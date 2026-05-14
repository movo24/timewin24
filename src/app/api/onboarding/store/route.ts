/**
 * POST /api/onboarding/store
 *
 * Étape 2 de l'onboarding : crée le premier site (Store) + horaires d'ouverture.
 *
 * Body: { name, address?, city?, schedules: [{ dayOfWeek, closed, openTime, closeTime }] }
 * Marque Company.onboardingStep = 2 si succès.
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

const scheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  closed: z.boolean(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

const onboardingStoreSchema = z.object({
  name: z.string().min(1, "Nom du site requis").max(120),
  address: z.string().max(255).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  schedules: z.array(scheduleSchema).optional().default([]),
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
    const parsed = onboardingStoreSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const companyId = user.companyId;

    // Création atomique : Store + schedules + StoreEmployee (OWNER lié à son store)
    const store = await prisma.$transaction(async (tx) => {
      const created = await tx.store.create({
        data: {
          name: parsed.data.name,
          address: parsed.data.address ?? null,
          city: parsed.data.city ?? null,
          country: "FR", // hérité de la Company en pratique
          timezone: "Europe/Paris",
          status: "ACTIVE",
          companyId,
        },
      });

      // Schedules (un par jour de la semaine fournie)
      for (const sched of parsed.data.schedules) {
        await tx.storeSchedule.create({
          data: {
            storeId: created.id,
            dayOfWeek: sched.dayOfWeek,
            closed: sched.closed,
            openTime: sched.closed ? null : sched.openTime ?? "09:00",
            closeTime: sched.closed ? null : sched.closeTime ?? "19:00",
          },
        });
      }

      // Mark onboarding step 2 done
      await tx.company.update({
        where: { id: companyId },
        data: { onboardingStep: 2 },
      });

      return created;
    });

    await logAudit(user.id, "CREATE", "Store", store.id, {
      action: "onboarding_step_store",
      name: parsed.data.name,
    });

    return successResponse({
      store,
      nextStep: "employees",
    });
  } catch (err) {
    console.error("POST /api/onboarding/store error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

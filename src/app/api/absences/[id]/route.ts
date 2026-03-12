import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { AbsenceStatus } from "@/generated/prisma/client";
import { createReplacementOffers } from "@/lib/replacement";

// PATCH /api/absences/[id] — Manager approves or rejects
// RBAC: Manager can only manage absences for employees in their assigned stores
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const { status, managerResponse } = body as {
      status: string;
      managerResponse?: string;
    };

    if (!status || !["APPROVED", "REJECTED"].includes(status)) {
      return errorResponse("Statut invalide (APPROVED ou REJECTED attendu)");
    }

    // Find the declaration
    const declaration = await prisma.absenceDeclaration.findUnique({
      where: { id },
    });
    if (!declaration) {
      return errorResponse("Déclaration non trouvée", 404);
    }
    if (declaration.status !== "PENDING") {
      return errorResponse("Cette déclaration a déjà été traitée");
    }

    const user = session!.user as { id: string; role: string; employeeId: string | null };

    // RBAC: Manager can only approve/reject absences for employees in their stores
    if (user.role === "MANAGER") {
      const { storeIds } = await getAccessibleStoreIds();
      if (storeIds) {
        const employeeStores = await prisma.storeEmployee.findMany({
          where: { employeeId: declaration.employeeId },
          select: { storeId: true },
        });
        const employeeStoreIds = employeeStores.map(s => s.storeId);
        const hasCommonStore = employeeStoreIds.some(sid => storeIds.includes(sid));
        if (!hasCommonStore) {
          return errorResponse("Accès refusé : cet employé n'est pas dans vos magasins", 403);
        }
      }
    }

    if (status === "APPROVED") {
      // Wrap status update AND unavailability creation in a single atomic transaction
      const updated = await prisma.$transaction(async (tx) => {
        // Update declaration
        const result = await tx.absenceDeclaration.update({
          where: { id },
          data: {
            status: status as AbsenceStatus,
            managerId: user.id,
            managerResponse: managerResponse || null,
            processedAt: new Date(),
          },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        });

        // Create unavailabilities for each day in the range
        const start = new Date(declaration.startDate);
        const end = new Date(declaration.endDate);
        const current = new Date(start);

        while (current <= end) {
          const dateStr = current.toISOString().split("T")[0];
          // Check if unavailability already exists for this date
          const existing = await tx.unavailability.findFirst({
            where: {
              employeeId: declaration.employeeId,
              type: "VARIABLE",
              date: new Date(dateStr),
            },
          });

          if (!existing) {
            await tx.unavailability.create({
              data: {
                employeeId: declaration.employeeId,
                type: "VARIABLE",
                date: new Date(dateStr),
                reason: `Absence: ${declaration.type}${declaration.reason ? ` — ${declaration.reason}` : ""}`,
              },
            });
          }

          current.setDate(current.getDate() + 1);
        }

        return result;
      });

      // Create replacement offers for affected shifts (outside transaction — non-critical)
      const offersCreated = await createReplacementOffers({
        id: declaration.id,
        employeeId: declaration.employeeId,
        startDate: declaration.startDate,
        endDate: declaration.endDate,
      });

      console.log(
        `[PATCH /api/absences/${id}] APPROVED — Created unavailabilities + ${offersCreated} replacement offers`
      );

      return successResponse(updated);
    } else {
      // Rejection: simple update, no transaction needed
      const updated = await prisma.absenceDeclaration.update({
        where: { id },
        data: {
          status: status as AbsenceStatus,
          managerId: user.id,
          managerResponse: managerResponse || null,
          processedAt: new Date(),
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      console.log(`[PATCH /api/absences/${id}] REJECTED by ${user.id}`);
      return successResponse(updated);
    }
  } catch (err) {
    console.error("[PATCH /api/absences] Error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

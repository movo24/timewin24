import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse, getSessionOrUnauthorized } from "@/lib/api-helpers";

// ─── GET /api/employees/[id]/context ─────────────────
// Le POS appelle cet endpoint pour récupérer le contexte d'un employé.
// Retourne uniquement les infos utiles pour la caisse (pas de données RH sensibles).
//
// Auth : Bearer API key ou session NextAuth

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await getSessionOrUnauthorized();
    if (error) return error;
    const user = session!.user as { id: string; role: string; companyId: string | null };

    const { id } = await params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        stores: {
          select: {
            storeId: true,
            store: { select: { id: true, name: true, city: true, status: true } },
          },
        },
        user: { select: { role: true, active: true } },
      },
    });

    if (!employee) {
      return errorResponse("Employé introuvable", 404);
    }

    // SaaS multi-tenant: cross-company access masquée comme "introuvable"
    if (
      user.role !== "SUPER_ADMIN" &&
      user.companyId &&
      employee.companyId &&
      employee.companyId !== user.companyId
    ) {
      return errorResponse("Employé introuvable", 404);
    }

    return successResponse({
      // Identité (pas de données sensibles : pas de salaire, pas de contrat)
      employee_id: employee.id,
      employee_code: employee.employeeCode,
      first_name: employee.firstName,
      last_name: employee.lastName,
      full_name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,

      // Statut
      active: employee.active,
      user_active: employee.user?.active ?? true,

      // Rôle POS
      pos_role: employee.posRole || "cashier",
      timewin_role: employee.user?.role || "EMPLOYEE",
      max_discount: employee.maxDiscountPct || 0,

      // Compétences (utiles pour la caisse)
      skills: employee.skills,

      // Magasins autorisés
      allowed_stores: employee.stores.map((s) => ({
        store_id: s.storeId,
        name: s.store.name,
        city: s.store.city,
        status: s.store.status,
      })),

      // posQrCode: NEVER expose — auth credential
    });
  } catch (err) {
    console.error("GET /api/employees/[id]/context error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

import { prisma } from "@/lib/prisma";
import { requireEmployee, successResponse } from "@/lib/api-helpers";

/**
 * GET /api/me/stores — Liste des magasins de l'employé connecté
 */
export async function GET() {
  const { employeeId, error } = await requireEmployee();
  if (error) return error;

  const stores = await prisma.storeEmployee.findMany({
    where: { employeeId: employeeId! },
    select: {
      storeId: true,
      store: { select: { id: true, name: true, city: true, latitude: true, longitude: true } },
    },
  });

  return successResponse({ stores });
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";

/**
 * GET /api/me/colleagues
 * List colleagues (other active employees) — available to any authenticated employee.
 * Optionally filter by storeId to show only colleagues in a specific store.
 */
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session.user as { id: string; employeeId: string | null };

    if (!user.employeeId) {
      return errorResponse("Aucun profil employé lié à ce compte", 400);
    }

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    // Get the stores this employee is assigned to
    const employeeStores = await prisma.storeEmployee.findMany({
      where: { employeeId: user.employeeId! },
      select: { storeId: true },
    });
    const myStoreIds = employeeStores.map((s) => s.storeId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      active: true,
      id: { not: user.employeeId },
      // Only show colleagues from stores the employee belongs to
      stores: { some: { storeId: storeId && myStoreIds.includes(storeId) ? storeId : { in: myStoreIds } } },
    };

    const colleagues = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: { firstName: "asc" },
      take: 100,
    });

    return successResponse({ colleagues });
  } catch (err) {
    console.error("GET /api/me/colleagues error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

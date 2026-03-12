import { prisma } from "@/lib/prisma";
import { requireAuthenticated, errorResponse, successResponse } from "@/lib/api-helpers";

// GET /api/me — Get current user profile + linked employee info
export async function GET() {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session!.user as { id: string; role: string; employeeId: string | null };

    // Get user info
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        lastLoginAt: true,
        loginCount: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            email: true,
            active: true,
            weeklyHours: true,
            contractType: true,
            skills: true,
            stores: {
              select: {
                store: { select: { id: true, name: true, city: true } },
              },
            },
          },
        },
      },
    });

    if (!dbUser) return errorResponse("Utilisateur introuvable", 404);

    return successResponse({ user: dbUser });
  } catch (err) {
    console.error("GET /api/me error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

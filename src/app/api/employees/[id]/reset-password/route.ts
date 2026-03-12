import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const resetSchema = z.object({
  newPassword: z.string().min(8, "Mot de passe min. 8 caractères"),
});

// POST /api/employees/[id]/reset-password
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "), 400);
    }
    const { newPassword } = parsed.data;

    // Find the User linked to this employee
    const user = await prisma.user.findUnique({
      where: { employeeId: id },
    });

    if (!user) {
      return errorResponse("Aucun compte trouvé pour cet employé", 404);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
      },
    });

    await logAudit(session!.user.id, "UPDATE", "User", user.id, {
      action: "reset-password",
      employeeId: id,
    });

    return successResponse({ success: true });
  } catch (err) {
    console.error("POST /api/employees/[id]/reset-password error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

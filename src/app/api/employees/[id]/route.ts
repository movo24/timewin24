import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { employeeUpdateSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

// GET /api/employees/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        stores: { include: { store: { select: { id: true, name: true } } } },
        unavailabilities: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!employee) return errorResponse("Employé non trouvé", 404);
    return successResponse(employee);
  } catch (err) {
    console.error("GET /api/employees/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// PUT /api/employees/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const parsed = employeeUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const existing = await prisma.employee.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing) return errorResponse("Employé non trouvé", 404);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { storeIds, password: _password, role: _role, ...data } = parsed.data;

    // Email is required - refuse empty/null
    if (data.email !== undefined) {
      const trimmedEmail = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      if (!trimmedEmail) {
        return errorResponse("L'email est obligatoire");
      }
      data.email = trimmedEmail;
    }

    // Check email uniqueness if changed (on both Employee AND User tables)
    if (data.email && data.email !== existing.email) {
      const [emailTakenEmployee, emailTakenUser] = await Promise.all([
        prisma.employee.findUnique({ where: { email: data.email } }),
        prisma.user.findFirst({ where: { email: data.email, NOT: { employeeId: id } } }),
      ]);
      if (emailTakenEmployee) return errorResponse("Un employé avec cet email existe déjà");
      if (emailTakenUser) return errorResponse("Un compte avec cet email existe déjà");
    }

    const employee = await prisma.$transaction(async (tx) => {
      // Update store assignments if provided
      if (storeIds !== undefined) {
        await tx.storeEmployee.deleteMany({ where: { employeeId: id } });
        if (storeIds.length > 0) {
          await tx.storeEmployee.createMany({
            data: storeIds.map((storeId) => ({ storeId, employeeId: id })),
          });
        }
      }

      // Sync email to User account if changed
      if (data.email && data.email !== existing.email && existing.user) {
        await tx.user.update({
          where: { employeeId: id },
          data: {
            email: data.email,
            name: `${data.firstName ?? existing.firstName} ${data.lastName ?? existing.lastName}`,
          },
        });
      }

      return tx.employee.update({
        where: { id },
        data: {
          ...data,
        },
        include: {
          stores: { include: { store: { select: { id: true, name: true } } } },
        },
      });
    });

    await logAudit(session!.user.id, "UPDATE", "Employee", id, {
      before: existing,
      after: employee,
    });

    return successResponse(employee);
  } catch (err) {
    console.error("PUT /api/employees/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// DELETE /api/employees/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) return errorResponse("Employé non trouvé", 404);

    // Delete User account first (FK constraint), then Employee
    await prisma.$transaction(async (tx) => {
      await tx.user.deleteMany({ where: { employeeId: id } });
      await tx.employee.delete({ where: { id } });
    });

    await logAudit(session!.user.id, "DELETE", "Employee", id, {
      deleted: existing,
    });

    return successResponse({ success: true });
  } catch (err) {
    console.error("DELETE /api/employees/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

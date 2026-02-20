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
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      stores: { include: { store: { select: { id: true, name: true } } } },
    },
  });

  if (!employee) return errorResponse("Employé non trouvé", 404);
  return successResponse(employee);
}

// PUT /api/employees/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = employeeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return errorResponse("Employé non trouvé", 404);

  const { storeIds, ...data } = parsed.data;

  // Check email uniqueness if changed
  if (data.email && data.email !== existing.email) {
    const emailTaken = await prisma.employee.findUnique({
      where: { email: data.email },
    });
    if (emailTaken) return errorResponse("Un employé avec cet email existe déjà");
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

    return tx.employee.update({
      where: { id },
      data,
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
}

// DELETE /api/employees/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return errorResponse("Employé non trouvé", 404);

  await prisma.employee.delete({ where: { id } });
  await logAudit(session!.user.id, "DELETE", "Employee", id, {
    deleted: existing,
  });

  return successResponse({ success: true });
}

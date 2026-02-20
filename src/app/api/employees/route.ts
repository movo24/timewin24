import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { employeeCreateSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

// GET /api/employees
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const search = searchParams.get("search") || "";
  const storeId = searchParams.get("storeId") || "";
  const activeOnly = searchParams.get("active") === "true";

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (storeId) {
    where.stores = { some: { storeId } };
  }
  if (activeOnly) {
    where.active = true;
  }

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { lastName: "asc" },
      include: {
        stores: { include: { store: { select: { id: true, name: true } } } },
        costConfig: {
          include: {
            country: { select: { code: true, name: true, employerRate: true, minimumWageHour: true, reductionEnabled: true, reductionMaxCoeff: true, reductionThreshold: true } },
          },
        },
      },
    }),
    prisma.employee.count({ where }),
  ]);

  return successResponse({
    employees,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

// POST /api/employees
export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = employeeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const { storeIds, ...data } = parsed.data;

  // Check unique email
  const existing = await prisma.employee.findUnique({
    where: { email: data.email },
  });
  if (existing) return errorResponse("Un employé avec cet email existe déjà");

  const employee = await prisma.employee.create({
    data: {
      ...data,
      stores: {
        create: storeIds.map((storeId) => ({ storeId })),
      },
    },
    include: {
      stores: { include: { store: { select: { id: true, name: true } } } },
    },
  });

  await logAudit(session!.user.id, "CREATE", "Employee", employee.id, {
    ...data,
    storeIds,
  });

  return successResponse(employee, 201);
}

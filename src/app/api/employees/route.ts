import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { employeeCreateSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";

// GET /api/employees
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
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
          unavailabilities: { orderBy: { createdAt: "desc" } },
        },
      }),
      prisma.employee.count({ where }),
    ]);

    return successResponse({
      employees,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("GET /api/employees error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// POST /api/employees
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const parsed = employeeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { storeIds, password, role, ...data } = parsed.data;

    // Email is required for employee creation
    const email = data.email.trim().toLowerCase();

    // Password is required for new employee (creates login account)
    if (!password) {
      return errorResponse("Le mot de passe est obligatoire pour créer un employé", 400);
    }

    // Check unique email on both Employee AND User tables
    const [existingEmployee, existingUser] = await Promise.all([
      prisma.employee.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { email } }),
    ]);
    if (existingEmployee) return errorResponse("Un employé avec cet email existe déjà");
    if (existingUser) return errorResponse("Un compte avec cet email existe déjà");

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create Employee + User in atomic transaction
    const employee = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email,
          active: data.active ?? true,
          weeklyHours: data.weeklyHours ?? null,
          contractType: data.contractType ?? null,
          priority: data.priority ?? 1,
          maxHoursPerDay: data.maxHoursPerDay ?? null,
          maxHoursPerWeek: data.maxHoursPerWeek ?? null,
          minRestBetween: data.minRestBetween ?? null,
          skills: data.skills ?? [],
          preferredStoreId: data.preferredStoreId ?? null,
          shiftPreference: data.shiftPreference ?? "JOURNEE",
          stores: {
            create: storeIds.map((storeId: string) => ({ storeId })),
          },
        },
        include: {
          stores: { include: { store: { select: { id: true, name: true } } } },
        },
      });

      // Create associated User account
      await tx.user.create({
        data: {
          email,
          passwordHash,
          name: `${data.firstName} ${data.lastName}`,
          role: role ?? "EMPLOYEE",
          employeeId: emp.id,
          mustChangePassword: true,
        },
      });

      return emp;
    });

    await logAudit(session!.user.id, "CREATE", "Employee", employee.id, {
      ...data,
      email,
      role: role ?? "EMPLOYEE",
      storeIds,
    });

    return successResponse(employee, 201);
  } catch (err) {
    console.error("POST /api/employees error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

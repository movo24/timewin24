import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createAccountSchema = z.object({
  employeeId: z.string().min(1, "Employé requis"),
  password: z.string().min(8, "Mot de passe min. 8 caractères"),
  role: z.enum(["EMPLOYEE", "MANAGER"]).default("EMPLOYEE"),
});

// GET /api/accounts — List all user accounts with employee info
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;
    const user = session!.user as { id: string; role: string; companyId: string | null };

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20") || 20));

    // SaaS multi-tenant scope on User
    const tenantScope: Record<string, unknown> =
      user.role !== "SUPER_ADMIN" && user.companyId
        ? { companyId: user.companyId }
        : {};

    const where = search
      ? {
          ...tenantScope,
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            {
              employee: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" as const } },
                  { lastName: { contains: search, mode: "insensitive" as const } },
                  { employeeCode: { contains: search, mode: "insensitive" as const } },
                ],
              },
            },
          ],
        }
      : tenantScope;

    const [accounts, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          active: true,
          lastLoginAt: true,
          loginCount: true,
          failedAttempts: true,
          lockedUntil: true,
          createdAt: true,
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              active: true,
              contractType: true,
              stores: {
                select: {
                  store: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return successResponse({
      accounts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET /api/accounts error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// POST /api/accounts — Create a user account for an employee
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;
    const requester = session!.user as { id: string; role: string; companyId: string | null };

    const body = await req.json();
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { employeeId, password, role } = parsed.data;

    // Check employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, email: true, firstName: true, lastName: true, companyId: true, user: true },
    });

    if (!employee) return errorResponse("Employé introuvable", 404);
    if (employee.user) return errorResponse("Cet employé a déjà un compte utilisateur", 409);

    // SaaS multi-tenant: cross-company forbidden
    if (
      requester.role !== "SUPER_ADMIN" &&
      requester.companyId &&
      employee.companyId &&
      employee.companyId !== requester.companyId
    ) {
      return errorResponse("Accès refusé : employé hors de votre Company", 403);
    }

    // Create user account
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: employee.email || `${employee.id}@no-email.local`,
        passwordHash,
        name: `${employee.firstName} ${employee.lastName}`,
        role: role as "EMPLOYEE" | "MANAGER",
        employeeId: employee.id,
        mustChangePassword: true,
        // SaaS multi-tenant — inherit Company from employee
        companyId: employee.companyId ?? requester.companyId ?? null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    await logAudit(session!.user.id, "CREATE", "UserAccount", user.id, {
      employeeId,
      role,
    });

    return successResponse(user, 201);
  } catch (err) {
    console.error("POST /api/accounts error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

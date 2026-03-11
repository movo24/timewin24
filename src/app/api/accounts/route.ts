import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createAccountSchema = z.object({
  employeeId: z.string().min(1, "Employé requis"),
  password: z.string().min(6, "Mot de passe min. 6 caractères"),
  role: z.enum(["EMPLOYEE", "MANAGER"]).default("EMPLOYEE"),
});

// GET /api/accounts — List all user accounts with employee info
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const where = search
    ? {
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
    : {};

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
}

// POST /api/accounts — Create a user account for an employee
export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const { employeeId, password, role } = parsed.data;

  // Check employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, email: true, firstName: true, lastName: true, user: true },
  });

  if (!employee) return errorResponse("Employé introuvable", 404);
  if (employee.user) return errorResponse("Cet employé a déjà un compte utilisateur", 409);

  // Create user account
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: employee.email || `${employee.id}@no-email.local`,
      passwordHash,
      name: `${employee.firstName} ${employee.lastName}`,
      role: role as "EMPLOYEE" | "MANAGER",
      employeeId: employee.id,
      mustChangePassword: true, // Forcer le changement à la première connexion
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
}

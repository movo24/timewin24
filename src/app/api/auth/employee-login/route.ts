import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api-helpers";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";
import { validatePosAuth } from "@/lib/pos-auth";

// ─── POST /api/auth/employee-login ───────────────────
// Le POS appelle cet endpoint pour authentifier un employé à la caisse.
// TimeWin24 = source de vérité des employés.
// Le POS ne crée jamais d'employé, il consomme un contexte.
//
// Auth : HMAC SHA-256, Bearer API key, ou X-POS-Secret (legacy)
// Retour : contexte complet pour la session POS

const loginSchema = z.object({
  pin: z.string().min(4).max(8).optional(),
  qrCode: z.string().optional(),
  employeeCode: z.string().optional(),
  storeId: z.string().min(1, "storeId requis"),
  deviceId: z.string().optional(),
}).refine(
  (data) => data.pin || data.qrCode || data.employeeCode,
  { message: "pin, qrCode ou employeeCode requis" }
);

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 login attempts per minute per IP
    const ip = getClientIp(req);
    const rl = checkRateLimit(`login:${ip}`, RATE_LIMITS.login);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de tentatives de connexion. Réessayez plus tard." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        }
      );
    }

    // Auth: HMAC, Bearer API key, or legacy X-POS-Secret
    const bodyText = await req.text();

    // Try HMAC or legacy POS secret first
    const hmacSig = req.headers.get("x-pos-signature");
    const legacySecret = req.headers.get("x-pos-secret");

    if (hmacSig || legacySecret) {
      const authError = await validatePosAuth(req, bodyText);
      if (authError) return authError;
    } else {
      // Try Bearer API key
      const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
      if (!bearer) {
        return errorResponse("Authentification service requise (HMAC, Bearer ou X-POS-Secret)", 401);
      }
      const key = await prisma.serviceApiKey.findUnique({ where: { key: bearer } });
      if (!key?.active) {
        return errorResponse("Clé service invalide", 401);
      }
    }

    const body = JSON.parse(bodyText);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { pin, qrCode, employeeCode, storeId, deviceId } = parsed.data;

    // Find employee — PIN uses bcrypt comparison (cannot query directly)
    const includeRelations = {
      stores: { select: { storeId: true } },
      user: { select: { role: true } },
      costConfig: { select: { hourlyRateGross: true } },
    };

    let employee;
    if (employeeCode) {
      employee = await prisma.employee.findFirst({
        where: { employeeCode },
        include: includeRelations,
      });
    } else if (qrCode) {
      employee = await prisma.employee.findFirst({
        where: { posQrCode: qrCode },
        include: includeRelations,
      });
    } else if (pin) {
      // PIN is bcrypt-hashed — fetch store employees and compare
      const storeEmployees = await prisma.employee.findMany({
        where: {
          posPin: { not: null },
          stores: { some: { storeId } },
        },
        include: includeRelations,
      });
      for (const emp of storeEmployees) {
        if (emp.posPin && await bcrypt.compare(pin, emp.posPin)) {
          employee = emp;
          break;
        }
      }
    }

    if (!employee) {
      return errorResponse("Employé introuvable", 404);
    }

    if (!employee.active) {
      return errorResponse("Employé désactivé. Contactez votre administrateur.", 403);
    }

    // Check store access
    const allowedStoreIds = employee.stores.map((s) => s.storeId);
    if (!allowedStoreIds.includes(storeId)) {
      return errorResponse("Employé non autorisé sur ce magasin", 403);
    }

    // Check store is active
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.status !== "ACTIVE") {
      return errorResponse("Magasin inactif ou introuvable", 403);
    }

    // Generate session token
    const sessionToken = `twsess_${randomBytes(32).toString("hex")}`;

    // Build permissions based on role
    const role = employee.posRole || employee.user?.role || "EMPLOYEE";
    const permissions = buildPosPermissions(role, employee.maxDiscountPct || 0);

    return successResponse({
      // Identité
      employee_id: employee.id,
      employee_code: employee.employeeCode,
      full_name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,

      // Rôle & droits
      role: employee.posRole || "cashier",
      timewin_role: employee.user?.role || "EMPLOYEE",
      permissions,
      max_discount: employee.maxDiscountPct || 0,

      // Statut
      active: employee.active,
      allowed_stores: allowedStoreIds,

      // Session
      session_token: sessionToken,
      store_id: storeId,
      device_id: deviceId || null,

      // Snapshot data (le POS stocke ça dans ses ventes)
      snapshot: {
        employee_id: employee.id,
        employee_name: `${employee.firstName} ${employee.lastName}`,
        employee_role: employee.posRole || "cashier",
        max_discount: employee.maxDiscountPct || 0,
        captured_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("POST /api/auth/employee-login error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

function buildPosPermissions(role: string, maxDiscount: number) {
  const base = {
    open_register: true,
    close_register: false,
    void_sale: false,
    refund: false,
    discount_max: maxDiscount,
    access_backoffice: false,
    manage_stock: false,
    view_reports: false,
    manage_employees: false,
  };

  switch (role.toLowerCase()) {
    case "admin":
    case "super_admin":
      return { ...base, close_register: true, void_sale: true, refund: true, access_backoffice: true, manage_stock: true, view_reports: true, manage_employees: true, discount_max: 100 };
    case "manager":
      return { ...base, close_register: true, void_sale: true, refund: true, access_backoffice: true, manage_stock: true, view_reports: true, discount_max: Math.max(maxDiscount, 20) };
    case "cashier":
    default:
      return base;
  }
}

import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, getAccessibleStoreIds, errorResponse, successResponse } from "@/lib/api-helpers";
import bcrypt from "bcryptjs";

function generateEmployeeCode(): string {
  return String(randomInt(100000, 1000000)); // 6-digit numeric (CSPRNG)
}

function generatePin(length = 4): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(randomInt(min, max)); // CSPRNG, gates POS/inventory access
}

/**
 * POST /api/employees/[id]/access
 * Manage employee access: block, unblock, set-pin, set-code, generate-code, force-code-change
 *
 * Body: { action, value?, reason? }
 * Actions:
 *   block           — block access (reason optional)
 *   unblock         — restore active access
 *   suspend         — suspend access (reason optional)
 *   set-pin         — set PIN (4-6 digits, value required)
 *   generate-pin    — auto-generate and set PIN
 *   set-code        — manually set employeeCode (value required, must be unique)
 *   generate-code   — auto-generate a new unique employeeCode
 *   force-code-change — toggle forceCodeChange flag
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const { action, value, reason } = body as { action: string; value?: string; reason?: string };

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, accessStatus: true },
    });
    if (!employee) return errorResponse("Employé introuvable", 404);

    // M110 — store-scoping : un MANAGER ne gère que les employés de ses magasins.
    // getAccessibleStoreIds() renvoie null pour un admin (tout accès).
    const { storeIds: accessibleStoreIds } = await getAccessibleStoreIds();
    if (accessibleStoreIds !== null) {
      const inScope = await prisma.storeEmployee.findFirst({
        where: { employeeId: id, storeId: { in: accessibleStoreIds } },
        select: { storeId: true },
      });
      if (!inScope) return errorResponse("Accès refusé : employé hors de votre périmètre", 403);
    }

    switch (action) {
      case "block": {
        await prisma.employee.update({
          where: { id },
          data: {
            accessStatus: "BLOCKED",
            blockedAt: new Date(),
            blockedReason: reason || "Accès bloqué par un administrateur",
          },
        });
        return successResponse({ status: "BLOCKED", reason });
      }

      case "unblock": {
        await prisma.employee.update({
          where: { id },
          data: {
            accessStatus: "ACTIVE",
            blockedAt: null,
            blockedReason: null,
          },
        });
        return successResponse({ status: "ACTIVE" });
      }

      case "suspend": {
        await prisma.employee.update({
          where: { id },
          data: {
            accessStatus: "SUSPENDED",
            blockedAt: new Date(),
            blockedReason: reason || "Accès suspendu",
          },
        });
        return successResponse({ status: "SUSPENDED", reason });
      }

      case "set-pin": {
        if (!value) return errorResponse("PIN requis", 400);
        if (!/^\d{4,6}$/.test(value)) return errorResponse("PIN invalide — 4 à 6 chiffres requis", 400);
        const hashed = await bcrypt.hash(value, 10);
        await prisma.employee.update({ where: { id }, data: { posPin: hashed } });
        return successResponse({ pinSet: true, length: value.length });
      }

      case "generate-pin": {
        const pin = generatePin(4);
        const hashed = await bcrypt.hash(pin, 10);
        await prisma.employee.update({ where: { id }, data: { posPin: hashed } });
        return successResponse({ pinSet: true, pin }); // return plain PIN once for communication
      }

      case "set-code": {
        if (!value) return errorResponse("Code employé requis", 400);
        if (value.trim().length < 3) return errorResponse("Code trop court (min 3 caractères)", 400);
        const conflict = await prisma.employee.findFirst({
          where: { employeeCode: value.trim(), id: { not: id } },
          select: { id: true },
        });
        if (conflict) return errorResponse("Ce code employé est déjà utilisé", 409);
        await prisma.employee.update({ where: { id }, data: { employeeCode: value.trim() } });
        return successResponse({ employeeCode: value.trim() });
      }

      case "generate-code": {
        // Generate a unique 6-digit code
        let newCode: string;
        let attempts = 0;
        do {
          newCode = generateEmployeeCode();
          const exists = await prisma.employee.findUnique({ where: { employeeCode: newCode }, select: { id: true } });
          if (!exists) break;
          attempts++;
        } while (attempts < 10);
        await prisma.employee.update({ where: { id }, data: { employeeCode: newCode! } });
        return successResponse({ employeeCode: newCode! });
      }

      case "force-code-change": {
        const current = await prisma.employee.findUnique({ where: { id }, select: { forceCodeChange: true } });
        const next = !(current?.forceCodeChange ?? false);
        await prisma.employee.update({ where: { id }, data: { forceCodeChange: next } });
        return successResponse({ forceCodeChange: next });
      }

      default:
        return errorResponse(`Action inconnue: ${action}`, 400);
    }
  } catch (err) {
    logger.error("POST /api/employees/[id]/access error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

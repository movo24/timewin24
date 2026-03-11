import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireEmployee,
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { saveFile, ALLOWED_TYPES, MAX_FILE_SIZE } from "@/lib/uploads";
import { AbsenceType } from "@/generated/prisma/client";
import { dispatchNotificationAsync } from "@/lib/notifications/dispatcher";

const VALID_TYPES: AbsenceType[] = ["MALADIE", "CONGE", "PERSONNEL", "ACCIDENT", "AUTRE"];

// POST /api/absences — Employee declares an absence
export async function POST(req: NextRequest) {
  try {
    const { employeeId, error } = await requireEmployee();
    if (error) return error;

    const formData = await req.formData();
    const type = formData.get("type") as string;
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    const reason = formData.get("reason") as string | null;
    const document = formData.get("document") as File | null;

    // Validate type
    if (!type || !VALID_TYPES.includes(type as AbsenceType)) {
      return errorResponse("Type d'absence invalide");
    }

    // Validate dates
    if (!startDate || !endDate) {
      return errorResponse("Les dates de début et de fin sont requises");
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return errorResponse("Format de date invalide (attendu: YYYY-MM-DD)");
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return errorResponse("Date invalide");
    }
    if (end < start) {
      return errorResponse("La date de fin doit être après la date de début");
    }

    // Handle document upload
    let documentPath: string | null = null;
    let documentName: string | null = null;
    let documentMime: string | null = null;

    if (document && document.size > 0) {
      if (!ALLOWED_TYPES.includes(document.type)) {
        return errorResponse(
          "Type de fichier non autorisé. Formats acceptés : JPEG, PNG, WebP, PDF"
        );
      }
      if (document.size > MAX_FILE_SIZE) {
        return errorResponse("Le fichier est trop volumineux (max 50 Mo)");
      }
      const saved = await saveFile(document);
      documentPath = saved.storedPath;
      documentName = saved.filename;
      documentMime = saved.mimeType;
    }

    const declaration = await prisma.absenceDeclaration.create({
      data: {
        employeeId: employeeId!,
        type: type as AbsenceType,
        startDate: start,
        endDate: end,
        reason: reason || null,
        documentPath,
        documentName,
        documentMime,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    console.log(
      `[POST /api/absences] Employee ${employeeId} declared ${type} absence from ${startDate} to ${endDate}`
    );

    // Notify managers/admins about the absence
    const managers = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, active: true },
      select: { id: true },
    });
    if (managers.length > 0) {
      dispatchNotificationAsync({
        userIds: managers.map((m) => m.id),
        eventType: "ABSENCE_REPORTED",
        context: {
          employeeName: `${declaration.employee.firstName} ${declaration.employee.lastName}`,
          dates: `${startDate} au ${endDate}`,
        },
      });
    }

    return successResponse(declaration, 201);
  } catch (err) {
    console.error("[POST /api/absences] Error:", err);
    return errorResponse(
      "Erreur serveur: " + (err instanceof Error ? err.message : "inconnue"),
      500
    );
  }
}

// GET /api/absences — List declarations
// Employee: own only. Manager/Admin: all (filterable by status, employeeId)
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session!.user as { role: string; employeeId: string | null };
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const employeeIdFilter = searchParams.get("employeeId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (user.role === "EMPLOYEE") {
      // Employee sees only their own
      if (!user.employeeId) return errorResponse("Profil employé non lié", 400);
      where.employeeId = user.employeeId;
    } else {
      // Manager/Admin can filter by employee
      if (employeeIdFilter) {
        where.employeeId = employeeIdFilter;
      }
    }

    if (status) {
      where.status = status;
    }

    const declarations = await prisma.absenceDeclaration.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            stores: {
              select: { store: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return successResponse({ declarations });
  } catch (err) {
    console.error("[GET /api/absences] Error:", err);
    return errorResponse(
      "Erreur serveur: " + (err instanceof Error ? err.message : "inconnue"),
      500
    );
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { unavailabilityCreateSchema } from "@/lib/validations";

// POST /api/unavailabilities
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const body = await req.json();
    const parsed = unavailabilityCreateSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[POST /api/unavailabilities] Validation error:", parsed.error.issues);
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { employeeId, type, dayOfWeek, date, startTime, endTime, reason } = parsed.data;

    // Validate VARIABLE type requires a date
    if (type === "VARIABLE" && !date) {
      return errorResponse("Une date est requise pour une indisponibilité variable");
    }

    // Validate FIXED type requires a dayOfWeek
    if (type === "FIXED" && (dayOfWeek === null || dayOfWeek === undefined)) {
      return errorResponse("Un jour de la semaine est requis pour une indisponibilité fixe");
    }

    // Validate date format (YYYY-MM-DD)
    if (date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return errorResponse("Format de date invalide (attendu: YYYY-MM-DD)");
      }
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return errorResponse("Date invalide");
      }
    }

    // Verify employee exists
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return errorResponse("Employé non trouvé", 404);

    // Check for duplicate (same employee, same type, same date or dayOfWeek)
    if (type === "VARIABLE" && date) {
      const existing = await prisma.unavailability.findFirst({
        where: {
          employeeId,
          type: "VARIABLE",
          date: new Date(date),
        },
      });
      if (existing) {
        return errorResponse("Cette date d'indisponibilité existe déjà pour cet employé");
      }
    }

    if (type === "FIXED" && dayOfWeek !== null && dayOfWeek !== undefined) {
      const existing = await prisma.unavailability.findFirst({
        where: {
          employeeId,
          type: "FIXED",
          dayOfWeek,
        },
      });
      if (existing) {
        return errorResponse("Ce jour d'indisponibilité fixe existe déjà pour cet employé");
      }
    }

    const unavailability = await prisma.unavailability.create({
      data: {
        employeeId,
        type,
        dayOfWeek: type === "FIXED" ? dayOfWeek : null,
        date: type === "VARIABLE" && date ? new Date(date) : null,
        startTime: startTime || null,
        endTime: endTime || null,
        reason: reason || null,
      },
    });

    console.log(`[POST /api/unavailabilities] Created ${type} unavailability ${unavailability.id} for employee ${employeeId}`);
    return successResponse(unavailability, 201);
  } catch (err) {
    console.error("[POST /api/unavailabilities] Error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

// DELETE /api/unavailabilities?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return errorResponse("ID requis");

    const existing = await prisma.unavailability.findUnique({ where: { id } });
    if (!existing) return errorResponse("Indisponibilité non trouvée", 404);

    await prisma.unavailability.delete({ where: { id } });

    console.log(`[DELETE /api/unavailabilities] Deleted unavailability ${id}`);
    return successResponse({ success: true });
  } catch (err) {
    console.error("[DELETE /api/unavailabilities] Error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse, getSessionOrUnauthorized } from "@/lib/api-helpers";
import { z } from "zod";

// ─── POST /api/attendance/clock-in ───────────────────
// Enregistre un pointage d'arrivée.
// Peut être appelé :
//   - par le POS (session employé ouverte → event vers TimeWin24)
//   - par l'app mobile employé (avec GPS + photo)
//   - par le backoffice (correction manuelle)
//
// TimeWin24 est le SEUL système qui gère le pointage.

const clockInSchema = z.object({
  employeeId: z.string().min(1),
  storeId: z.string().min(1),
  // GPS (optionnel — obligatoire depuis l'app mobile, pas depuis POS)
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
  // Photo preuve (optionnel — obligatoire depuis l'app mobile)
  photoPath: z.string().optional(),
  // Source du pointage
  source: z.enum(["mobile", "pos", "manual"]).optional().default("manual"),
});

export async function POST(req: NextRequest) {
  try {
    const { error } = await getSessionOrUnauthorized();
    if (error) return error;

    const body = await req.json();
    const parsed = clockInSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { employeeId, storeId, latitude, longitude, accuracy, photoPath, source } = parsed.data;

    // Verify employee exists, is active, and has terrain access
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || !employee.active) {
      return errorResponse("Employé introuvable ou inactif", 404);
    }
    if (employee.accessStatus === "BLOCKED") {
      return errorResponse(`Accès bloqué${employee.blockedReason ? ` : ${employee.blockedReason}` : ""}`, 403);
    }
    if (employee.accessStatus === "SUSPENDED") {
      return errorResponse("Accès suspendu. Contactez votre responsable.", 403);
    }

    // Verify store
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return errorResponse("Magasin introuvable", 404);

    // Calculate distance if GPS provided
    let distanceMeters = 0;
    if (latitude && longitude && store.latitude && store.longitude) {
      distanceMeters = haversineDistance(latitude, longitude, store.latitude, store.longitude);
    }

    // Find today's shift for this employee
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    const dateObj = new Date(dateStr + "T00:00:00Z");

    const shift = await prisma.shift.findFirst({
      where: { employeeId, storeId, date: dateObj },
    });

    // Calculate late status
    let status: "ON_TIME" | "LATE" = "ON_TIME";
    let lateMinutes = 0;

    if (shift) {
      const [shiftH, shiftM] = shift.startTime.split(":").map(Number);
      const shiftStart = shiftH * 60 + shiftM;
      const nowMinutes = today.getHours() * 60 + today.getMinutes();
      const diff = nowMinutes - shiftStart;

      if (diff > 5) {
        status = "LATE";
        lateMinutes = diff;
      }
    }

    const clockIn = await prisma.clockIn.create({
      data: {
        employeeId,
        storeId,
        shiftId: shift?.id || null,
        clockInAt: new Date(),
        photoPath: photoPath || `auto-${source}-${Date.now()}`,
        photoMimeType: photoPath ? "image/jpeg" : "text/plain",
        latitude: latitude || 0,
        longitude: longitude || 0,
        accuracy: accuracy || null,
        distanceMeters,
        status,
        lateMinutes,
      },
    });

    return successResponse({
      clock_in_id: clockIn.id,
      employee_id: employeeId,
      store_id: storeId,
      clock_in_at: clockIn.clockInAt.toISOString(),
      status,
      late_minutes: lateMinutes,
      distance_meters: Math.round(distanceMeters),
      shift_id: shift?.id || null,
      source,
    }, 201);
  } catch (err) {
    logger.error("POST /api/attendance/clock-in error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

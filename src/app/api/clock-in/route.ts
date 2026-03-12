import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireEmployee,
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { saveFile, ALLOWED_TYPES, MAX_FILE_SIZE } from "@/lib/uploads";
import { isWithinRadius } from "@/lib/geo";
import { ClockInStatus } from "@/generated/prisma/client";

const LATE_TOLERANCE_MINUTES = 5;
const MAX_RADIUS_METERS = 50;

/**
 * POST /api/clock-in — Pointer son arrivée (employé uniquement)
 * Body: multipart/form-data { photo, latitude, longitude, accuracy?, storeId }
 */
export async function POST(req: NextRequest) {
  try {
    const { session, employeeId, error } = await requireEmployee();
    if (error) return error;

    const formData = await req.formData();
    const photo = formData.get("photo") as File | null;
    const latStr = formData.get("latitude") as string | null;
    const lonStr = formData.get("longitude") as string | null;
    const accStr = formData.get("accuracy") as string | null;
    const storeId = formData.get("storeId") as string | null;

    // Validate required fields
    if (!photo) return errorResponse("Photo requise");
    if (!latStr || !lonStr) return errorResponse("Position GPS requise");
    if (!storeId) return errorResponse("Magasin requis");

    const employeeLat = parseFloat(latStr);
    const employeeLon = parseFloat(lonStr);
    const accuracy = accStr ? parseFloat(accStr) : null;

    if (isNaN(employeeLat) || isNaN(employeeLon)) {
      return errorResponse("Coordonnées GPS invalides");
    }

    // Validate photo
    if (!ALLOWED_TYPES.includes(photo.type) || !photo.type.startsWith("image/")) {
      return errorResponse("Seules les photos sont acceptées (JPEG, PNG, WebP)");
    }
    if (photo.size > MAX_FILE_SIZE) {
      return errorResponse("Photo trop volumineuse (max 50 MB)");
    }

    // Check employee is assigned to this store
    const storeLink = await prisma.storeEmployee.findUnique({
      where: { storeId_employeeId: { storeId, employeeId: employeeId! } },
    });
    if (!storeLink) {
      return errorResponse("Vous n'êtes pas assigné à ce magasin", 403);
    }

    // Load store with GPS coordinates
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    if (!store) return errorResponse("Magasin non trouvé", 404);
    if (store.latitude === null || store.longitude === null) {
      return errorResponse("Ce magasin n'a pas de coordonnées GPS configurées");
    }

    // Check geofence (50m radius)
    const geoCheck = isWithinRadius(
      employeeLat,
      employeeLon,
      store.latitude,
      store.longitude,
      MAX_RADIUS_METERS
    );
    if (!geoCheck.withinRadius) {
      return errorResponse(
        `Vous êtes trop loin du magasin (${geoCheck.distanceMeters}m). Rayon autorisé : ${MAX_RADIUS_METERS}m`
      );
    }

    // Check no active clock-in (without clock-out)
    const activeClockIn = await prisma.clockIn.findFirst({
      where: {
        employeeId: employeeId!,
        clockOutAt: { equals: null },
      },
    });
    if (activeClockIn) {
      return errorResponse(
        "Vous avez déjà un pointage actif. Veuillez d'abord pointer votre départ."
      );
    }

    // Save photo
    const saved = await saveFile(photo);

    // Server timestamp
    const now = new Date();

    // Find today's shift for this employee at this store
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const shift = await prisma.shift.findFirst({
      where: {
        employeeId: employeeId!,
        storeId,
        date: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { startTime: "asc" },
    });

    // Calculate status
    let status: ClockInStatus = ClockInStatus.ON_TIME;
    let lateMinutes = 0;

    if (shift) {
      const [shiftH, shiftM] = shift.startTime.split(":").map(Number);
      const shiftStartMinutes = shiftH * 60 + shiftM;
      const clockInMinutes = now.getHours() * 60 + now.getMinutes();
      const diff = clockInMinutes - shiftStartMinutes;

      if (diff > LATE_TOLERANCE_MINUTES) {
        status = ClockInStatus.LATE;
        lateMinutes = diff;
      }
    }

    // Create clock-in record
    const clockIn = await prisma.clockIn.create({
      data: {
        employeeId: employeeId!,
        storeId,
        shiftId: shift?.id || null,
        clockInAt: now,
        photoPath: saved.storedPath,
        photoMimeType: saved.mimeType,
        latitude: employeeLat,
        longitude: employeeLon,
        accuracy,
        distanceMeters: geoCheck.distanceMeters,
        status,
        lateMinutes,
      },
      include: {
        store: { select: { id: true, name: true } },
        shift: { select: { id: true, startTime: true, endTime: true } },
      },
    });

    return successResponse(clockIn, 201);
  } catch (err) {
    console.error("POST /api/clock-in error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

/**
 * GET /api/clock-in — Liste des pointages
 * Employee: ses propres pointages
 * Manager/Admin: tous, filtrable par ?storeId=&date=
 */
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session!.user as { id: string; role: string; employeeId: string | null };
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date"); // YYYY-MM-DD
    const storeId = searchParams.get("storeId");

    // Build date filter
    let dateFilter: { gte: Date; lte: Date } | undefined;
    if (dateStr) {
      const d = new Date(dateStr + "T00:00:00Z");
      const dEnd = new Date(dateStr + "T23:59:59.999Z");
      dateFilter = { gte: d, lte: dEnd };
    }

    if (user.role === "EMPLOYEE") {
      if (!user.employeeId) return successResponse({ clockIns: [] });

      const clockIns = await prisma.clockIn.findMany({
        where: {
          employeeId: user.employeeId,
          ...(dateFilter ? { clockInAt: dateFilter } : {}),
        },
        include: {
          store: { select: { id: true, name: true } },
          shift: { select: { id: true, startTime: true, endTime: true } },
        },
        orderBy: { clockInAt: "desc" },
        take: 50,
      });

      return successResponse({ clockIns });
    }

    // Admin/Manager
    const clockIns = await prisma.clockIn.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        ...(dateFilter ? { clockInAt: dateFilter } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        store: { select: { id: true, name: true } },
        shift: { select: { id: true, startTime: true, endTime: true } },
      },
      orderBy: { clockInAt: "desc" },
      take: 200,
    });

    return successResponse({ clockIns });
  } catch (err) {
    console.error("GET /api/clock-in error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

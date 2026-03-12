import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireEmployee,
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

// GET /api/market-listings — Browse marketplace listings
// Employee: OPEN listings from their stores (excluding own). ?mine=true for own listings.
// Manager/Admin: all listings, filterable by ?status= and ?storeId=
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session!.user as { id: string; role: string; employeeId: string | null };
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const storeId = searchParams.get("storeId");
    const mine = searchParams.get("mine") === "true";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (user.role === "EMPLOYEE") {
      if (!user.employeeId) return errorResponse("Profil employé non lié", 400);

      if (mine) {
        // Own listings (all statuses)
        where.posterId = user.employeeId;
      } else {
        // Available listings from employee's stores (exclude own)
        const employeeStores = await prisma.storeEmployee.findMany({
          where: { employeeId: user.employeeId },
          select: { storeId: true },
        });
        const storeIds = employeeStores.map((s) => s.storeId);

        where.status = "OPEN";
        where.storeId = { in: storeIds };
        where.posterId = { not: user.employeeId };
      }
    } else {
      // Manager/Admin — filterable
      if (status) where.status = status;
      if (storeId) where.storeId = storeId;
    }

    const listings = await prisma.shiftMarketListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Enrich with shift, store, poster, and claimant info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shiftIds: string[] = [...new Set(listings.map((l: any) => l.shiftId as string))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const empIds: string[] = [...new Set([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...listings.map((l: any) => l.posterId as string),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...listings.filter((l: any) => l.claimantId).map((l: any) => l.claimantId as string),
    ])];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeIds: string[] = [...new Set(listings.map((l: any) => l.storeId as string))];

    const [shifts, employees, stores] = await Promise.all([
      prisma.shift.findMany({
        where: { id: { in: shiftIds } },
        select: { id: true, date: true, startTime: true, endTime: true, employeeId: true },
      }),
      prisma.employee.findMany({
        where: { id: { in: empIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, name: true },
      }),
    ]);

    const shiftMap = new Map(shifts.map((s) => [s.id, s]));
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const storeMap = new Map(stores.map((s) => [s.id, s]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = listings.map((l: any) => ({
      ...l,
      shift: shiftMap.get(l.shiftId) || null,
      store: storeMap.get(l.storeId) || null,
      poster: empMap.get(l.posterId) || null,
      claimant: l.claimantId ? empMap.get(l.claimantId) || null : null,
      constraintChecks: l.constraintChecks ? JSON.parse(l.constraintChecks) : null,
    }));

    return successResponse({ listings: enriched });
  } catch (err) {
    console.error("[GET /api/market-listings] Error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

// POST /api/market-listings — Post a shift to marketplace
export async function POST(req: NextRequest) {
  try {
    const { employeeId, error } = await requireEmployee();
    if (error) return error;

    const body = await req.json();
    const { shiftId, message } = body as { shiftId?: string; message?: string };

    if (!shiftId) return errorResponse("shiftId est requis");

    // Verify shift belongs to employee
    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) return errorResponse("Shift non trouvé", 404);
    if (shift.employeeId !== employeeId) {
      return errorResponse("Ce shift ne vous appartient pas");
    }

    // Verify shift is in the future
    const shiftDate = new Date(shift.date);
    const now = new Date();
    if (shiftDate < new Date(now.toISOString().split("T")[0])) {
      return errorResponse("Impossible de publier un shift passé");
    }

    // Check no existing OPEN/CLAIMED listing for this shift
    const existing = await prisma.shiftMarketListing.findFirst({
      where: {
        shiftId,
        status: { in: ["OPEN", "CLAIMED"] },
      },
    });
    if (existing) {
      return errorResponse("Ce shift est déjà publié sur le marché");
    }

    // Check no pending ShiftExchange for this shift
    const pendingExchange = await prisma.shiftExchange.findFirst({
      where: {
        requesterShiftId: shiftId,
        status: { in: ["PENDING_PEER", "PENDING_MANAGER"] },
      },
    });
    if (pendingExchange) {
      return errorResponse("Un échange est déjà en cours pour ce shift");
    }

    // Calculate expiration: min(shift start - 2h, now + 48h)
    const [h, m] = shift.startTime.split(":").map(Number);
    const shiftDateTime = new Date(
      `${shiftDate.toISOString().split("T")[0]}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`
    );
    const twoHoursBefore = new Date(shiftDateTime.getTime() - 2 * 60 * 60 * 1000);
    const fortyEightHoursFromNow = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const expiresAt = twoHoursBefore < fortyEightHoursFromNow ? twoHoursBefore : fortyEightHoursFromNow;

    if (expiresAt <= now) {
      return errorResponse("Ce shift est trop proche pour être publié (expire immédiatement)");
    }

    const listing = await prisma.shiftMarketListing.create({
      data: {
        posterId: employeeId!,
        shiftId,
        storeId: shift.storeId,
        posterMessage: message || null,
        expiresAt,
      },
    });

    console.log(`[POST /api/market-listings] Employee ${employeeId} posted shift ${shiftId} to marketplace`);
    return successResponse(listing, 201);
  } catch (err) {
    console.error("[POST /api/market-listings] Error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

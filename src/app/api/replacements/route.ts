import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

// GET /api/replacements — List replacement offers
// Employee: sees their pending candidacies with shift details
// Manager/Admin: sees all offers (filterable by status, storeId)
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session!.user as { role: string; employeeId: string | null };
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const storeId = searchParams.get("storeId");

    if (user.role === "EMPLOYEE") {
      if (!user.employeeId) return errorResponse("Profil employé non lié", 400);

      // Employee sees their candidacies
      const candidateFilter = searchParams.get("candidateStatus") || "PENDING";

      const candidates = await prisma.replacementCandidate.findMany({
        where: {
          employeeId: user.employeeId,
          ...(candidateFilter !== "ALL" ? { status: candidateFilter as never } : {}),
        },
        include: {
          offer: {
            include: {
              shift: true,
              store: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      });

      return successResponse({ candidates });
    }

    // Manager/Admin: see all offers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (storeId) {
      where.storeId = storeId;
    }

    const offers = await prisma.replacementOffer.findMany({
      where,
      include: {
        shift: true,
        store: { select: { id: true, name: true } },
        candidates: {
          include: {
            employee: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Enrich with absent employee info
    const absentEmployeeIds = [...new Set(offers.map((o) => o.absentEmployeeId))];
    const absentEmployees = await prisma.employee.findMany({
      where: { id: { in: absentEmployeeIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const absentMap = Object.fromEntries(absentEmployees.map((e) => [e.id, e]));

    const enriched = offers.map((o) => ({
      ...o,
      absentEmployee: absentMap[o.absentEmployeeId] || null,
    }));

    return successResponse({ offers: enriched });
  } catch (err) {
    console.error("[GET /api/replacements] Error:", err);
    return errorResponse(
      "Erreur serveur: " + (err instanceof Error ? err.message : "inconnue"),
      500
    );
  }
}

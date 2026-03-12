import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { storeCreateSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

// GET /api/stores - List stores with pagination and search
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search") || "";

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { city: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: "asc" },
        include: {
          schedules: { orderBy: { dayOfWeek: "asc" } },
          _count: { select: { employees: true, shifts: true } },
        },
      }),
      prisma.store.count({ where }),
    ]);

    return successResponse({
      stores,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("GET /api/stores error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// POST /api/stores - Create store
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const parsed = storeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const store = await prisma.store.create({ data: parsed.data });
    await logAudit(session!.user.id, "CREATE", "Store", store.id, parsed.data);

    return successResponse(store, 201);
  } catch (err) {
    console.error("POST /api/stores error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

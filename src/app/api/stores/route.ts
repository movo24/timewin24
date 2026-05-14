import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireManagerOrAdmin, getAccessibleStoreIds, successResponse, errorResponse } from "@/lib/api-helpers";
import { storeCreateSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

// GET /api/stores - List stores with pagination and search
// RBAC: Manager sees only their assigned stores, Admin sees all
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;
    const user = session!.user as { id: string; role: string; companyId: string | null };

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search") || "";
    const includeInactive = searchParams.get("includeInactive") === "true";

    // RBAC: Manager sees only their assigned stores
    const { storeIds: accessibleStoreIds } = await getAccessibleStoreIds();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [];

    // SaaS multi-tenant: scope by companyId (SUPER_ADMIN bypass)
    if (user.role !== "SUPER_ADMIN" && user.companyId) {
      conditions.push({ companyId: user.companyId });
    }

    // By default, only show active stores (admin can request all)
    if (!includeInactive) {
      conditions.push({ status: "ACTIVE" });
    }

    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { city: { contains: search, mode: "insensitive" as const } },
        ],
      });
    }
    if (accessibleStoreIds) {
      conditions.push({ id: { in: accessibleStoreIds } });
    }

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : { AND: conditions }
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

// POST /api/stores - DISABLED
// Les magasins sont gérés exclusivement depuis POS Caisse.
// TimeWin24 reçoit les magasins via synchronisation POS → TimeWin24.
// Pour créer un magasin, utilisez le backoffice POS Caisse.
export async function POST() {
  return errorResponse(
    "Création de magasin désactivée. Les magasins sont gérés depuis POS Caisse et synchronisés automatiquement.",
    403,
  );
}

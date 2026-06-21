import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, getAccessibleStoreIds, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { productCreateSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const url = new URL(req.url);
    const search = url.searchParams.get("search") || "";
    const storeId = url.searchParams.get("storeId");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;

    const { storeIds: accessibleStoreIds } = await getAccessibleStoreIds();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      active: true,
      ...(storeId
        ? { storeId }
        : accessibleStoreIds
          ? { storeId: { in: accessibleStoreIds } }
          : { storeId: { not: undefined } }),
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        include: { store: { select: { name: true, storeCode: true } } },
      }),
      prisma.product.count({ where }),
    ]);

    return successResponse({ products, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (e) {
    console.error("[GET /api/products]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const body = await req.json();
    const parsed = productCreateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((e) => e.message).join(", "), 400);

    const data = parsed.data;

    const product = await prisma.product.create({
      data: {
        name: data.name,
        barcode: data.barcode || null,
        sku: data.sku || null,
        price: data.price ?? null,
        oldPrice: data.oldPrice ?? null,
        currency: data.currency,
        vatRate: data.vatRate ?? null,
        category: data.category || null,
        variantName: data.variantName || null,
        storeId: data.storeId || null,
        active: data.active,
        source: data.source,
        sourceRef: data.sourceRef || null,
        priceUpdatedAt: data.price != null ? new Date() : null,
      },
    });

    await logAudit(session!.user.id, "CREATE", "Product", product.id);

    return successResponse(product, 201);
  } catch (e) {
    console.error("[POST /api/products]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { labelPrintJobCreateSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const body = await req.json();
    const parsed = labelPrintJobCreateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((e) => e.message).join(", "), 400);

    const data = parsed.data;

    // Verify template exists
    const template = await prisma.labelTemplate.findUnique({ where: { id: data.templateId } });
    if (!template) return errorResponse("Template introuvable", 404);

    // Fetch products for price snapshot
    const productIds = data.items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Verify all products exist
    for (const item of data.items) {
      if (!productMap.has(item.productId)) {
        return errorResponse(`Produit ${item.productId} introuvable`, 404);
      }
    }

    const totalLabels = data.items.reduce((sum, i) => sum + i.quantity, 0);

    const job = await prisma.labelPrintJob.create({
      data: {
        userId: session!.user.id.startsWith("service:") ? null : session!.user.id,
        storeId: data.storeId || null,
        templateId: data.templateId,
        format: data.format,
        totalLabels,
        notes: data.notes || null,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            priceAtPrint: productMap.get(item.productId)?.price ?? null,
            promoLabel: item.promoLabel || null,
          })),
        },
      },
      include: {
        template: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    await logAudit(session!.user.id, "CREATE", "LabelPrintJob", job.id, {
      totalLabels,
      itemCount: data.items.length,
      format: data.format,
    });

    return successResponse(job, 201);
  } catch (e) {
    console.error("[POST /api/labels/print]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.labelPrintJob.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true } },
          template: { select: { name: true, type: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.labelPrintJob.count(),
    ]);

    return successResponse({ jobs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (e) {
    console.error("[GET /api/labels/print]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

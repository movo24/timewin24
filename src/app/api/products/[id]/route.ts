import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { productUpdateSchema } from "@/lib/validations";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: { store: { select: { name: true, storeCode: true } } },
    });
    if (!product) return errorResponse("Produit introuvable", 404);

    return successResponse(product);
  } catch (e) {
    console.error("[GET /api/products/:id]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return errorResponse("Produit introuvable", 404);

    const body = await req.json();
    const parsed = productUpdateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((e) => e.message).join(", "), 400);

    const data = parsed.data;
    const priceChanged = data.price !== undefined && data.price !== existing.price;

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        priceUpdatedAt: priceChanged ? new Date() : undefined,
      },
    });

    await logAudit(session!.user.id, "UPDATE", "Product", id);

    return successResponse(product);
  } catch (e) {
    console.error("[PUT /api/products/:id]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return errorResponse("Produit introuvable", 404);

    await prisma.product.delete({ where: { id } });
    await logAudit(session!.user.id, "DELETE", "Product", id);

    return successResponse({ deleted: true });
  } catch (e) {
    console.error("[DELETE /api/products/:id]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

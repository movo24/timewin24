import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { z } from "zod";

const storeLinkSchema = z.object({
  storeId: z.string().min(1),
  posStoreId: z.string().min(1),
  posStoreName: z.string().optional(),
});

const employeeLinkSchema = z.object({
  employeeId: z.string().min(1),
  posEmployeeId: z.string().min(1),
  posEmployeeName: z.string().optional(),
});

// POST /api/integrations/pos/[id]/links — Créer un lien magasin ou employé
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { type } = body as { type: "store" | "employee" };

  if (type === "store") {
    const parsed = storeLinkSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const link = await prisma.posStoreLink.create({
      data: {
        providerId: id,
        storeId: parsed.data.storeId,
        posStoreId: parsed.data.posStoreId,
        posStoreName: parsed.data.posStoreName || null,
      },
    });
    return successResponse(link, 201);
  }

  if (type === "employee") {
    const parsed = employeeLinkSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const link = await prisma.posEmployeeLink.create({
      data: {
        providerId: id,
        employeeId: parsed.data.employeeId,
        posEmployeeId: parsed.data.posEmployeeId,
        posEmployeeName: parsed.data.posEmployeeName || null,
      },
    });
    return successResponse(link, 201);
  }

  return errorResponse("type doit être 'store' ou 'employee'");
}

// DELETE /api/integrations/pos/[id]/links — Supprimer un lien
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const linkId = searchParams.get("linkId");
  const type = searchParams.get("type"); // "store" or "employee"

  if (!linkId || !type) return errorResponse("linkId et type requis");

  if (type === "store") {
    await prisma.posStoreLink.delete({ where: { id: linkId } });
  } else if (type === "employee") {
    await prisma.posEmployeeLink.delete({ where: { id: linkId } });
  } else {
    return errorResponse("type doit être 'store' ou 'employee'");
  }

  return successResponse({ message: "Lien supprimé" });
}

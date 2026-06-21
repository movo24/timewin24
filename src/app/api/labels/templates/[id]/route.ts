import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { labelTemplateUpdateSchema } from "@/lib/validations";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;
    const template = await prisma.labelTemplate.findUnique({ where: { id } });
    if (!template) return errorResponse("Template introuvable", 404);

    return successResponse(template);
  } catch (e) {
    console.error("[GET /api/labels/templates/:id]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;
    const existing = await prisma.labelTemplate.findUnique({ where: { id } });
    if (!existing) return errorResponse("Template introuvable", 404);

    const body = await req.json();
    const parsed = labelTemplateUpdateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((e) => e.message).join(", "), 400);

    const data = parsed.data;

    if (data.isDefault) {
      const type = data.type || existing.type;
      await prisma.labelTemplate.updateMany({
        where: { type, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const template = await prisma.labelTemplate.update({ where: { id }, data });
    await logAudit(session!.user.id, "UPDATE", "LabelTemplate", id);

    return successResponse(template);
  } catch (e) {
    console.error("[PUT /api/labels/templates/:id]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;
    const existing = await prisma.labelTemplate.findUnique({ where: { id } });
    if (!existing) return errorResponse("Template introuvable", 404);

    if (existing.isSystem) {
      return errorResponse("Les templates système ne peuvent pas être supprimés", 400);
    }

    await prisma.labelTemplate.delete({ where: { id } });
    await logAudit(session!.user.id, "DELETE", "LabelTemplate", id);

    return successResponse({ deleted: true });
  } catch (e) {
    console.error("[DELETE /api/labels/templates/:id]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

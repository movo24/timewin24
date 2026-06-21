import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { labelTemplateCreateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const templates = await prisma.labelTemplate.findMany({
      orderBy: [{ type: "asc" }, { isDefault: "desc" }, { name: "asc" }],
    });

    return successResponse({ templates });
  } catch (e) {
    console.error("[GET /api/labels/templates]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const body = await req.json();
    const parsed = labelTemplateCreateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((e) => e.message).join(", "), 400);

    const data = parsed.data;

    // If setting as default, unset others of same type
    if (data.isDefault) {
      await prisma.labelTemplate.updateMany({
        where: { type: data.type, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.labelTemplate.create({
      data: { ...data, isSystem: false },
    });

    await logAudit(session!.user.id, "CREATE", "LabelTemplate", template.id);

    return successResponse(template, 201);
  } catch (e) {
    console.error("[POST /api/labels/templates]", e);
    return errorResponse("Erreur serveur", 500);
  }
}

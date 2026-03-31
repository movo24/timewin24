import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateAppSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.string().max(50).optional(),
  provider: z.string().max(100).optional().nullable(),
  status: z.enum(["CONNECTED", "DISCONNECTED", "ERROR", "SYNCING"]).optional(),
  internal: z.boolean().optional(),
  apiUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  storeId: z.string().optional().nullable(),
  syncInterval: z.number().min(0).max(1440).optional(),
  config: z.string().optional().nullable(),
});

// GET /api/connected-apps/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const app = await prisma.connectedApp.findUnique({
    where: { id },
    include: {
      store: { select: { id: true, name: true, city: true } },
    },
  });

  if (!app) return errorResponse("Application introuvable", 404);

  const { apiKey, ...safe } = app;
  return successResponse({ app: { ...safe, hasApiKey: !!apiKey } });
}

// PUT /api/connected-apps/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateAppSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const existing = await prisma.connectedApp.findUnique({ where: { id } });
  if (!existing) return errorResponse("Application introuvable", 404);

  const updated = await prisma.connectedApp.update({
    where: { id },
    data: parsed.data,
  });

  const { apiKey: ak, ...safeDiff } = parsed.data;
  await logAudit(session!.user.id, "UPDATE", "ConnectedApp", id, {
    ...safeDiff,
    ...(ak !== undefined ? { apiKey: "[REDACTED]" } : {}),
  });

  const { apiKey, ...safe } = updated;
  return successResponse({ ...safe, hasApiKey: !!apiKey });
}

// DELETE /api/connected-apps/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.connectedApp.findUnique({ where: { id } });
  if (!existing) return errorResponse("Application introuvable", 404);

  await prisma.connectedApp.delete({ where: { id } });
  await logAudit(session!.user.id, "DELETE", "ConnectedApp", id, { name: existing.name });
  return successResponse({ message: "Application supprimée" });
}

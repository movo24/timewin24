import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  apiUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  apiSecret: z.string().optional().nullable(),
  accessToken: z.string().optional().nullable(),
  syncEmployees: z.boolean().optional(),
  syncTimeClock: z.boolean().optional(),
  syncSales: z.boolean().optional(),
  syncInterval: z.number().min(0).max(1440).optional(),
  notes: z.string().optional().nullable(),
});

// GET /api/integrations/pos/[id] — Détails d'un provider
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const provider = await prisma.posProvider.findUnique({
    where: { id },
    include: {
      storeLinks: true,
      employeeLinks: true,
      syncLogs: {
        orderBy: { startedAt: "desc" },
        take: 20,
      },
      _count: {
        select: { timeClocks: true, salesData: true },
      },
    },
  });

  if (!provider) return errorResponse("Provider introuvable", 404);

  return successResponse({ provider });
}

// PUT /api/integrations/pos/[id] — Modifier un provider
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateProviderSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const existing = await prisma.posProvider.findUnique({ where: { id } });
  if (!existing) return errorResponse("Provider introuvable", 404);

  const updated = await prisma.posProvider.update({
    where: { id },
    data: parsed.data,
  });

  await logAudit(session!.user.id, "UPDATE", "PosProvider", id, parsed.data);

  return successResponse(updated);
}

// DELETE /api/integrations/pos/[id] — Supprimer un provider (cascade)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.posProvider.findUnique({ where: { id } });
  if (!existing) return errorResponse("Provider introuvable", 404);

  await prisma.posProvider.delete({ where: { id } });

  await logAudit(session!.user.id, "DELETE", "PosProvider", id, {
    name: existing.name,
  });

  return successResponse({ message: "Provider supprimé" });
}

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
  try {
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

    // Strip sensitive fields before returning
    const { apiKey, apiSecret, accessToken, refreshToken, ...safeProvider } = provider as any;
    return successResponse({
      provider: {
        ...safeProvider,
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret,
        hasAccessToken: !!accessToken,
      },
    });
  } catch (err) {
    console.error("GET /api/integrations/pos/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// PUT /api/integrations/pos/[id] — Modifier un provider
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    // Strip sensitive fields before logging (BUG 17)
    const { apiKey: ak, apiSecret: as2, accessToken: at, ...safeDiff } = parsed.data;
    await logAudit(session!.user.id, "UPDATE", "PosProvider", id, {
      ...safeDiff,
      ...(ak !== undefined ? { apiKey: "[REDACTED]" } : {}),
      ...(as2 !== undefined ? { apiSecret: "[REDACTED]" } : {}),
      ...(at !== undefined ? { accessToken: "[REDACTED]" } : {}),
    });

    // Strip sensitive fields before returning (BUG 1)
    const { apiKey, apiSecret, accessToken, refreshToken, ...safeUpdated } = updated as any;
    return successResponse({
      ...safeUpdated,
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      hasAccessToken: !!accessToken,
    });
  } catch (err) {
    console.error("PUT /api/integrations/pos/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// DELETE /api/integrations/pos/[id] — Supprimer un provider (cascade)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
  } catch (err) {
    console.error("DELETE /api/integrations/pos/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

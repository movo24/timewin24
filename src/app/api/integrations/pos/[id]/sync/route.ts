import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { runSync } from "@/lib/pos/sync-engine";
import { z } from "zod";

const syncSchema = z.object({
  entity: z.enum(["employees", "timeclock", "sales", "stores"]),
  dateFrom: z.string().optional(), // "YYYY-MM-DD"
  dateTo: z.string().optional(),   // "YYYY-MM-DD"
});

// POST /api/integrations/pos/[id]/sync — Lance une synchronisation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const provider = await prisma.posProvider.findUnique({ where: { id } });
    if (!provider) return errorResponse("Provider introuvable", 404);
    if (!provider.active) return errorResponse("Provider désactivé", 400);

    const body = await req.json();
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { entity, dateFrom, dateTo } = parsed.data;

    const dateRange = dateFrom && dateTo
      ? { from: dateFrom, to: dateTo }
      : undefined;

    const result = await runSync(id, entity, { dateRange });

    return successResponse({ result });
  } catch (err) {
    console.error("POST /api/integrations/pos/[id]/sync error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

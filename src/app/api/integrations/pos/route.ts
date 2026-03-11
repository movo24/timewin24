import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createProviderSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  type: z.enum(["LIGHTSPEED", "SQUARE", "ZELTY", "SUMUP", "CUSTOM_API"]),
  apiUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  apiSecret: z.string().optional().nullable(),
  syncEmployees: z.boolean().default(true),
  syncTimeClock: z.boolean().default(true),
  syncSales: z.boolean().default(false),
  syncInterval: z.number().min(0).max(1440).default(60),
  notes: z.string().optional().nullable(),
});

// GET /api/integrations/pos — Liste des providers POS
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const providers = await prisma.posProvider.findMany({
    include: {
      storeLinks: {
        select: { id: true, storeId: true, posStoreId: true, posStoreName: true, active: true },
      },
      employeeLinks: {
        select: { id: true, employeeId: true, posEmployeeId: true, posEmployeeName: true, active: true },
      },
      syncLogs: {
        orderBy: { startedAt: "desc" },
        take: 5,
        select: {
          id: true,
          direction: true,
          status: true,
          entityType: true,
          totalRecords: true,
          created: true,
          failed: true,
          durationMs: true,
          startedAt: true,
        },
      },
      _count: {
        select: { storeLinks: true, employeeLinks: true, timeClocks: true, salesData: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return successResponse({ providers });
}

// POST /api/integrations/pos — Créer un provider POS
export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = createProviderSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const provider = await prisma.posProvider.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type as "LIGHTSPEED" | "SQUARE" | "ZELTY" | "SUMUP" | "CUSTOM_API",
      apiUrl: parsed.data.apiUrl || null,
      apiKey: parsed.data.apiKey || null,
      apiSecret: parsed.data.apiSecret || null,
      syncEmployees: parsed.data.syncEmployees,
      syncTimeClock: parsed.data.syncTimeClock,
      syncSales: parsed.data.syncSales,
      syncInterval: parsed.data.syncInterval,
      notes: parsed.data.notes || null,
    },
  });

  await logAudit(session!.user.id, "CREATE", "PosProvider", provider.id, {
    name: provider.name,
    type: provider.type,
  });

  return successResponse(provider, 201);
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { randomBytes } from "crypto";

const createAppSchema = z.object({
  name: z.string().min(1, "Nom requis").max(200),
  type: z.string().min(1).max(50), // "pos", "accounting", "hr", "erp", "custom"
  provider: z.string().max(100).optional().nullable(),
  internal: z.boolean().optional().default(false),
  apiUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  storeId: z.string().optional().nullable(),
  syncInterval: z.number().min(0).max(1440).optional().default(60),
  config: z.string().optional().nullable(),
});

// GET /api/connected-apps
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const apps = await prisma.connectedApp.findMany({
    include: {
      store: { select: { id: true, name: true, city: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Strip sensitive fields
  const safe = apps.map(({ apiKey, webhookSecret, ...rest }) => ({
    ...rest,
    hasApiKey: !!apiKey,
    hasWebhookSecret: !!webhookSecret,
  }));

  return successResponse({ apps: safe });
}

// POST /api/connected-apps
export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = createAppSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  // Generate a unique webhook secret
  const webhookSecret = `twpos_${randomBytes(24).toString("hex")}`;

  const app = await prisma.connectedApp.create({
    data: {
      ...parsed.data,
      webhookSecret,
      status: "DISCONNECTED",
    },
  });

  await logAudit(session!.user.id, "CREATE", "ConnectedApp", app.id, {
    name: app.name,
    type: app.type,
  });

  // Return with webhook secret visible (only at creation time)
  return successResponse(
    {
      ...app,
      apiKey: undefined,
    },
    201
  );
}

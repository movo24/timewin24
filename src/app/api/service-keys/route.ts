import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { randomBytes } from "crypto";
import { z } from "zod";

const createKeySchema = z.object({
  name: z.string().min(1, "Nom requis").max(200),
  service: z.string().min(1).max(50),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "MANAGER"]).optional().default("ADMIN"),
});

// GET /api/service-keys — liste des clés API
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const keys = await prisma.serviceApiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      service: true,
      role: true,
      active: true,
      lastUsedAt: true,
      createdAt: true,
      // NE PAS retourner la clé elle-même
      key: false,
    },
  });

  return successResponse({ keys });
}

// POST /api/service-keys — créer une nouvelle clé API
export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = createKeySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  // Generate a secure API key
  const apiKey = `tw24_${randomBytes(32).toString("hex")}`;

  const key = await prisma.serviceApiKey.create({
    data: {
      name: parsed.data.name,
      service: parsed.data.service,
      role: parsed.data.role as any,
      key: apiKey,
      createdBy: session!.user.id,
    },
  });

  // Return the key ONLY at creation time
  return successResponse(
    {
      id: key.id,
      name: key.name,
      service: key.service,
      role: key.role,
      key: apiKey, // Visible uniquement à la création
      createdAt: key.createdAt,
    },
    201
  );
}

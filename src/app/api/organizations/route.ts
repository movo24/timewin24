import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createOrgSchema = z.object({
  name: z.string().min(1, "Nom requis").max(200),
  legalName: z.string().max(200).optional().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]).optional().default("ACTIVE"),
  siret: z.string().max(20).optional().nullable(),
  siren: z.string().max(20).optional().nullable(),
  vatNumber: z.string().max(30).optional().nullable(),
  country: z.string().max(5).optional().default("FR"),
  currency: z.string().max(5).optional().default("EUR"),
  notes: z.string().optional().nullable(),
});

// GET /api/organizations
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const organizations = await prisma.organization.findMany({
    include: {
      units: {
        include: {
          _count: { select: { stores: true } },
        },
      },
      _count: { select: { units: true } },
    },
    orderBy: { name: "asc" },
  });

  return successResponse({ organizations });
}

// POST /api/organizations
export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const org = await prisma.organization.create({ data: parsed.data });

  await logAudit(session!.user.id, "CREATE", "Organization", org.id, {
    name: org.name,
  });

  return successResponse(org, 201);
}

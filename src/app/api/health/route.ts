import { prisma } from "@/lib/prisma";
import { successResponse } from "@/lib/api-helpers";

// GET /api/health — statut de l'API (public, pas d'auth)
export async function GET() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    // DB unreachable
  }

  const aiKey = !!process.env.GEMINI_API_KEY;

  return successResponse({
    status: dbOk ? "ok" : "degraded",
    version: "1.0.0",
    services: {
      database: dbOk,
      aiEngine: aiKey,
    },
    timestamp: new Date().toISOString(),
  });
}

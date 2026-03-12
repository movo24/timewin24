import { NextRequest } from "next/server";
import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { generateAllAlerts } from "@/lib/alerts";

/**
 * POST /api/alerts/generate?date=YYYY-MM-DD
 * Run all alert detection routines for the given date (defaults to today).
 */
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const dateStr =
      searchParams.get("date") || new Date().toISOString().split("T")[0];

    const result = await generateAllAlerts(dateStr);

    return successResponse(result);
  } catch (err) {
    console.error("POST /api/alerts/generate error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, errorResponse } from "@/lib/api-helpers";
import { getWeekBounds } from "@/lib/utils";

// GET /api/shifts/export?storeId=xxx&weekStart=yyyy-mm-dd
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");
    const weekStart = searchParams.get("weekStart");

    if (!storeId || !weekStart) {
      return errorResponse("storeId et weekStart sont requis");
    }

    const { weekStart: start, weekEnd: end } = getWeekBounds(weekStart);

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return errorResponse("Magasin non trouvé", 404);

    const shifts = await prisma.shift.findMany({
      where: {
        storeId,
        date: { gte: start, lte: end },
      },
      include: {
        employee: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // CSV escape helper — prevents formula injection
    function csvEscape(value: string): string {
      // Prevent formula injection
      if (/^[=+\-@\t\r]/.test(value)) value = "'" + value;
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (value.includes('"') || value.includes(',') || value.includes('\n')) {
        value = '"' + value.replace(/"/g, '""') + '"';
      } else {
        value = '"' + value + '"';
      }
      return value;
    }

    // Build CSV
    const header = "Date,Jour,Début,Fin,Employé,Email,Note";
    const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    const rows = shifts.map((s) => {
      const d = new Date(s.date);
      const dateStr = d.toISOString().split("T")[0];
      const dayName = dayNames[d.getDay()];
      const name = s.employee
        ? `${s.employee.firstName} ${s.employee.lastName}`
        : "NON ASSIGNÉ";
      const email = s.employee?.email || "";
      const note = s.note || "";
      return `${dateStr},${dayName},${s.startTime},${s.endTime},${csvEscape(name)},${csvEscape(email)},${csvEscape(note)}`;
    });

    const csv = [header, ...rows].join("\n");
    // Sanitize store name for Content-Disposition header (prevent header injection)
    const safeName = store.name.replace(/[^a-zA-Z0-9À-ÿ _-]/g, "").replace(/\s+/g, "_").slice(0, 50);
    const filename = `planning_${safeName}_${weekStart}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("GET /api/shifts/export error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

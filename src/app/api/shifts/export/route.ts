import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, errorResponse } from "@/lib/api-helpers";
import { getWeekBounds } from "@/lib/utils";

// GET /api/shifts/export?storeId=xxx&weekStart=yyyy-mm-dd
export async function GET(req: NextRequest) {
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
    const note = (s.note || "").replace(/"/g, '""');
    return `${dateStr},${dayName},${s.startTime},${s.endTime},"${name}",${email},"${note}"`;
  });

  const csv = [header, ...rows].join("\n");
  const filename = `planning_${store.name.replace(/\s+/g, "_")}_${weekStart}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

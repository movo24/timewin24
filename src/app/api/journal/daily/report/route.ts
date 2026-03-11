import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

/**
 * GET /api/journal/daily/report?date=YYYY-MM-DD&storeId=
 * Generate a plain-text daily report for the store.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireManagerOrAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date") || new Date().toISOString().split("T")[0];
  const storeId = searchParams.get("storeId");

  if (!storeId) return errorResponse("storeId est requis");

  const dayDate = new Date(dateStr + "T00:00:00Z");
  const dayEnd = new Date(dateStr + "T23:59:59Z");
  const dayOfWeek = dayDate.getUTCDay();

  const [store, shifts, clockIns, absences, replacements, messages, entries] =
    await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        include: { schedules: { where: { dayOfWeek } } },
      }),
      prisma.shift.findMany({
        where: { storeId, date: dayDate },
        include: {
          employee: { select: { firstName: true, lastName: true } },
          clockIn: true,
        },
        orderBy: { startTime: "asc" },
      }),
      prisma.clockIn.findMany({
        where: { storeId, clockInAt: { gte: dayDate, lte: dayEnd } },
        include: { employee: { select: { firstName: true, lastName: true } } },
        orderBy: { clockInAt: "asc" },
      }),
      prisma.absenceDeclaration.findMany({
        where: { status: "APPROVED", startDate: { lte: dayDate }, endDate: { gte: dayDate } },
        include: { employee: { select: { firstName: true, lastName: true } } },
      }),
      prisma.replacementOffer.findMany({
        where: { storeId, shift: { date: dayDate } },
        include: { shift: true },
      }),
      prisma.hrMessage.findMany({
        where: { storeId, parentId: { equals: null }, createdAt: { gte: dayDate, lte: dayEnd } },
        include: { sender: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.journalEntry.findMany({
        where: { storeId, date: dayDate },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  if (!store) return errorResponse("Magasin non trouvé", 404);

  const schedule = store.schedules[0] || null;
  const now = new Date();
  const clockedShiftIds = new Set(clockIns.filter((c) => c.shiftId).map((c) => c.shiftId));
  const absentEmployeeIds = new Set(absences.map((a) => a.employeeId));
  const noShows = shifts.filter(
    (s) =>
      s.employeeId &&
      !clockedShiftIds.has(s.id) &&
      !absentEmployeeIds.has(s.employeeId) &&
      new Date(`${dateStr}T${s.startTime}:00Z`) < now
  );

  const onTime = clockIns.filter((c) => c.status === "ON_TIME").length;
  const late = clockIns.filter((c) => c.status === "LATE").length;
  const openR = replacements.filter((r) => r.status === "OPEN").length;
  const filledR = replacements.filter((r) => r.status === "FILLED").length;
  const incidents = entries.filter((e) => e.type === "INCIDENT");

  // Format date in French
  const dateObj = new Date(dateStr + "T12:00:00Z");
  const frDate = dateObj.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const lines: string[] = [];
  const sep = "=".repeat(50);

  lines.push(sep);
  lines.push(`  RAPPORT JOURNALIER — ${store.name}`);
  lines.push(`  Date : ${frDate}`);
  if (schedule) {
    lines.push(`  Horaires : ${schedule.closed ? "FERMÉ" : `${schedule.openTime} - ${schedule.closeTime}`}`);
  }
  lines.push(sep);
  lines.push("");

  // Summary
  lines.push("RÉSUMÉ");
  lines.push(`  Shifts planifiés : ${shifts.length}`);
  lines.push(`  À l'heure : ${onTime} | En retard : ${late} | No-shows : ${noShows.length}`);
  lines.push(`  Absences déclarées : ${absences.length}`);
  lines.push(`  Remplacements : ${openR} ouvert(s), ${filledR} pourvu(s)`);
  lines.push(`  Messages RH : ${messages.length} | Incidents : ${incidents.length}`);
  lines.push("");

  // Chronology
  lines.push("CHRONOLOGIE");

  // Build events
  type Evt = { time: string; icon: string; text: string };
  const events: Evt[] = [];

  if (schedule && !schedule.closed && schedule.openTime) {
    events.push({ time: schedule.openTime, icon: "🔵", text: "Ouverture magasin" });
  }

  for (const c of clockIns) {
    const t = new Date(c.clockInAt).toISOString().slice(11, 16);
    const name = `${c.employee?.firstName || ""} ${c.employee?.lastName || ""}`.trim();
    if (c.status === "ON_TIME") {
      events.push({ time: t, icon: "🟢", text: `${name} — arrivé à l'heure` });
    } else if (c.status === "LATE") {
      events.push({ time: t, icon: "🟡", text: `${name} — retard ${c.lateMinutes} min` });
    }
    if (c.clockOutAt) {
      const ot = new Date(c.clockOutAt).toISOString().slice(11, 16);
      events.push({ time: ot, icon: "⬜", text: `${name} — départ` });
    }
  }

  for (const s of noShows) {
    const name = `${s.employee?.firstName || ""} ${s.employee?.lastName || ""}`.trim();
    events.push({ time: s.startTime, icon: "🔴", text: `${name} — absent (non déclaré)` });
  }

  for (const a of absences) {
    const name = `${a.employee?.firstName || ""} ${a.employee?.lastName || ""}`.trim();
    events.push({ time: "00:00", icon: "🟠", text: `${name} — absence déclarée (${a.type.toLowerCase()})` });
  }

  for (const r of replacements) {
    const t = r.shift?.startTime || "00:00";
    if (r.status === "OPEN") {
      events.push({ time: t, icon: "🔍", text: `Remplacement recherché (shift ${r.shift?.startTime}-${r.shift?.endTime})` });
    } else if (r.status === "FILLED") {
      events.push({ time: t, icon: "✅", text: `Remplacement trouvé (shift ${r.shift?.startTime}-${r.shift?.endTime})` });
    }
  }

  for (const m of messages) {
    const t = new Date(m.createdAt).toISOString().slice(11, 16);
    events.push({ time: t, icon: "💬", text: `Message RH : ${m.subject} (${m.sender?.name || "?"})` });
  }

  if (schedule && !schedule.closed && schedule.closeTime) {
    events.push({ time: schedule.closeTime, icon: "🔵", text: "Fermeture magasin" });
  }

  events.sort((a, b) => a.time.localeCompare(b.time));
  for (const e of events) {
    lines.push(`  ${e.time}  ${e.icon} ${e.text}`);
  }
  lines.push("");

  // Notes & incidents
  if (entries.length > 0) {
    lines.push("NOTES & INCIDENTS");
    const severityIcon: Record<string, string> = {
      LOW: "ℹ️",
      MEDIUM: "⚠️",
      HIGH: "🔶",
      CRITICAL: "🔴",
    };
    for (const e of entries) {
      const t = new Date(e.createdAt).toISOString().slice(11, 16);
      lines.push(`  [${t}] ${severityIcon[e.severity] || "📝"} ${e.title}`);
      if (e.description) {
        lines.push(`         ${e.description}`);
      }
    }
    lines.push("");
  }

  lines.push(sep);

  return successResponse({ report: lines.join("\n") });
}

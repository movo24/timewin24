import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

interface TimelineEvent {
  time: string;
  type: string;
  title: string;
  detail?: string;
  severity: "success" | "info" | "warning" | "error";
}

/**
 * GET /api/journal/daily?date=YYYY-MM-DD&storeId=
 * Aggregate all daily data for a store into a journal with timeline.
 */
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const storeId = searchParams.get("storeId");

    if (!storeId) return errorResponse("storeId est requis");

    const dayDate = new Date(dateStr + "T00:00:00Z");
    const dayEnd = new Date(dateStr + "T23:59:59Z");
    const dayOfWeek = dayDate.getUTCDay(); // 0=Sun

    const [store, shifts, clockIns, absences, replacements, messages, entries] =
      await Promise.all([
        // Store + schedule for this day
        prisma.store.findUnique({
          where: { id: storeId },
          include: {
            schedules: { where: { dayOfWeek } },
          },
        }),

        // All shifts for this day at this store
        prisma.shift.findMany({
          where: { storeId, date: dayDate },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
            clockIn: true,
          },
          orderBy: { startTime: "asc" },
        }),

        // Clock-ins for the day
        prisma.clockIn.findMany({
          where: {
            storeId,
            clockInAt: { gte: dayDate, lte: dayEnd },
          },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { clockInAt: "asc" },
        }),

        // Approved absences covering this date, scoped to store employees
        prisma.absenceDeclaration.findMany({
          where: {
            status: "APPROVED",
            startDate: { lte: dayDate },
            endDate: { gte: dayDate },
            employee: { stores: { some: { storeId } } },
          },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        }),

        // Replacement offers for shifts on this day
        prisma.replacementOffer.findMany({
          where: {
            storeId,
            shift: { date: dayDate },
          },
          include: {
            shift: {
              include: {
                employee: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        }),

        // HR messages for this store today (root threads only)
        prisma.hrMessage.findMany({
          where: {
            storeId,
            parentId: { equals: null },
            createdAt: { gte: dayDate, lte: dayEnd },
          },
          include: {
            sender: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        }),

        // Manual journal entries
        prisma.journalEntry.findMany({
          where: { storeId, date: dayDate },
          orderBy: { createdAt: "asc" },
        }),
      ]);

    if (!store) return errorResponse("Magasin non trouvé", 404);

    const schedule = store.schedules[0] || null;
    const openTime = schedule?.openTime || null;
    const closeTime = schedule?.closeTime || null;
    const closed = schedule?.closed || false;

    // ─── Build summary ─────────────────────────────
    const onTimeClockIns = clockIns.filter((c) => c.status === "ON_TIME");
    const lateClockIns = clockIns.filter((c) => c.status === "LATE");

    // No-shows: shifts with employee assigned, in the past, no clock-in
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

    const openReplacements = replacements.filter((r) => r.status === "OPEN").length;
    const filledReplacements = replacements.filter((r) => r.status === "FILLED").length;

    const summary = {
      totalShifts: shifts.length,
      staffed: shifts.filter((s) => s.employeeId).length,
      onTime: onTimeClockIns.length,
      late: lateClockIns.length,
      noShow: noShows.length,
      absent: absences.length,
      openReplacements,
      filledReplacements,
      hrMessages: messages.length,
      incidents: entries.filter((e) => e.type === "INCIDENT").length,
    };

    // ─── Build timeline ────────────────────────────
    const timeline: TimelineEvent[] = [];

    // Store opening
    if (openTime && !closed) {
      timeline.push({
        time: openTime,
        type: "STORE_OPEN",
        title: `Ouverture magasin — ${store.name}`,
        severity: "info",
      });
    }
    if (closed) {
      timeline.push({
        time: "00:00",
        type: "STORE_CLOSED",
        title: `Magasin fermé aujourd'hui`,
        severity: "info",
      });
    }

    // Clock-ins (arrivals)
    for (const c of clockIns) {
      const time = new Date(c.clockInAt).toISOString().slice(11, 16);
      const name = c.employee ? `${c.employee.firstName} ${c.employee.lastName}` : "Inconnu";

      if (c.status === "ON_TIME") {
        timeline.push({
          time,
          type: "ARRIVAL",
          title: `${name} — arrivé à l'heure`,
          severity: "success",
        });
      } else if (c.status === "LATE") {
        timeline.push({
          time,
          type: "LATE",
          title: `${name} — retard ${c.lateMinutes}min`,
          detail: `Shift prévu à ${c.shiftId ? "—" : "N/A"}`,
          severity: "warning",
        });
      }

      // Clock-out
      if (c.clockOutAt) {
        const outTime = new Date(c.clockOutAt).toISOString().slice(11, 16);
        timeline.push({
          time: outTime,
          type: "DEPARTURE",
          title: `${name} — départ`,
          severity: "info",
        });
      }
    }

    // No-shows
    for (const s of noShows) {
      const name = s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : "Inconnu";
      timeline.push({
        time: s.startTime,
        type: "NO_SHOW",
        title: `${name} — absent sans déclaration`,
        detail: `Shift ${s.startTime}-${s.endTime}`,
        severity: "error",
      });
    }

    // Approved absences
    for (const a of absences) {
      const name = a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : "Inconnu";
      timeline.push({
        time: "00:00",
        type: "ABSENCE",
        title: `${name} — absence déclarée (${a.type.toLowerCase()})`,
        detail: a.reason || undefined,
        severity: "warning",
      });
    }

    // Replacements
    for (const r of replacements) {
      const shiftTime = r.shift?.startTime || "00:00";
      if (r.status === "OPEN") {
        timeline.push({
          time: shiftTime,
          type: "REPLACEMENT_OPEN",
          title: `Remplacement recherché — shift ${r.shift?.startTime}-${r.shift?.endTime}`,
          severity: "warning",
        });
      } else if (r.status === "FILLED") {
        timeline.push({
          time: shiftTime,
          type: "REPLACEMENT_FILLED",
          title: `Remplacement trouvé — shift ${r.shift?.startTime}-${r.shift?.endTime}`,
          severity: "success",
        });
      }
    }

    // HR messages
    for (const m of messages) {
      const time = new Date(m.createdAt).toISOString().slice(11, 16);
      timeline.push({
        time,
        type: "HR_MESSAGE",
        title: `Message RH — ${m.subject}`,
        detail: `De : ${m.sender?.name || "Inconnu"}`,
        severity: "info",
      });
    }

    // Manual journal entries (incidents, notes)
    for (const e of entries) {
      const time = new Date(e.createdAt).toISOString().slice(11, 16);
      const severityMap: Record<string, TimelineEvent["severity"]> = {
        LOW: "info",
        MEDIUM: "warning",
        HIGH: "error",
        CRITICAL: "error",
      };
      timeline.push({
        time,
        type: e.type,
        title: e.title,
        detail: e.description || undefined,
        severity: severityMap[e.severity] || "info",
      });
    }

    // Store closing
    if (closeTime && !closed) {
      timeline.push({
        time: closeTime,
        type: "STORE_CLOSE",
        title: `Fermeture magasin`,
        severity: "info",
      });
    }

    // Sort timeline by time
    timeline.sort((a, b) => a.time.localeCompare(b.time));

    return successResponse({
      store: {
        id: store.id,
        name: store.name,
        openTime,
        closeTime,
        closed,
      },
      date: dateStr,
      summary,
      timeline,
      entries,
      shifts: shifts.map((s) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        employee: s.employee,
        clockIn: s.clockIn
          ? {
              status: s.clockIn.status,
              lateMinutes: s.clockIn.lateMinutes,
              clockInAt: s.clockIn.clockInAt,
              clockOutAt: s.clockIn.clockOutAt,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("GET /api/journal/daily error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

/**
 * POST /api/journal/daily — Add a manual journal entry (incident/note)
 */
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const body = await req.json();
    const { storeId, date, type, severity, title, description } = body as {
      storeId?: string;
      date?: string;
      type?: string;
      severity?: string;
      title?: string;
      description?: string;
    };

    if (!storeId || !date || !title) {
      return errorResponse("storeId, date et title sont requis");
    }

    if (title.length > 500) {
      return errorResponse("Le titre ne doit pas dépasser 500 caractères");
    }

    const validTypes = ["INCIDENT", "NOTE", "OBSERVATION"];
    const validSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

    if (type && !validTypes.includes(type)) {
      return errorResponse("Type invalide");
    }
    if (severity && !validSeverities.includes(severity)) {
      return errorResponse("Sévérité invalide");
    }

    const user = session!.user as { id: string };

    const entry = await prisma.journalEntry.create({
      data: {
        storeId,
        date: new Date(date + "T00:00:00Z"),
        type: (type as "INCIDENT" | "NOTE" | "OBSERVATION") || "NOTE",
        severity: (severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") || "LOW",
        title,
        description: description || null,
        authorId: user.id,
      },
    });

    return successResponse(entry, 201);
  } catch (err) {
    console.error("POST /api/journal/daily error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

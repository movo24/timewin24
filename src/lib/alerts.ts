import { prisma } from "./prisma";
import {
  ManagerAlertType,
  ManagerAlertSeverity,
} from "@/generated/prisma/client";
import { dispatchNotificationAsync } from "@/lib/notifications/dispatcher";

/* ─── Types ──────────────────────────────────── */

interface AlertInput {
  type: ManagerAlertType;
  severity: ManagerAlertSeverity;
  storeId: string;
  date: Date;
  time: string | null;
  title: string;
  contextKey: string;
  details: Record<string, unknown>;
}

/* ─── Helpers ────────────────────────────────── */

/** Parse "HH:mm" into minutes since midnight */
function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Get current minutes since midnight (UTC) */
function nowMinutes(): number {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/* ─── 1. Store Not Opened ────────────────────── */

async function detectStoreNotOpened(dateStr: string): Promise<AlertInput[]> {
  const dayDate = new Date(dateStr + "T00:00:00Z");
  const dayEnd = new Date(dateStr + "T23:59:59Z");
  const dayOfWeek = dayDate.getUTCDay();
  const currentMin = nowMinutes();

  const schedules = await prisma.storeSchedule.findMany({
    where: {
      dayOfWeek,
      closed: false,
      openTime: { not: null },
    },
    include: {
      store: { select: { id: true, name: true } },
    },
  });

  const alerts: AlertInput[] = [];

  for (const schedule of schedules) {
    if (!schedule.openTime) continue;

    const openMin = parseTime(schedule.openTime);
    // Only alert if we're past openTime + 15 min
    if (currentMin < openMin + 15) continue;

    // Check if any clock-in exists for this store today
    const firstClockIn = await prisma.clockIn.findFirst({
      where: {
        storeId: schedule.storeId,
        clockInAt: { gte: dayDate, lte: dayEnd },
      },
      orderBy: { clockInAt: "asc" },
    });

    if (!firstClockIn) {
      alerts.push({
        type: "STORE_NOT_OPENED",
        severity: "CRITICAL",
        storeId: schedule.storeId,
        date: dayDate,
        time: schedule.openTime,
        title: `Magasin non ouvert — ${schedule.store.name}`,
        contextKey: "opening",
        details: {
          storeName: schedule.store.name,
          openTime: schedule.openTime,
        },
      });
    }
  }

  return alerts;
}

/* ─── 2. Absence Not Replaced ────────────────── */

async function detectAbsenceNotReplaced(
  dateStr: string
): Promise<AlertInput[]> {
  const dayDate = new Date(dateStr + "T00:00:00Z");

  const absences = await prisma.absenceDeclaration.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: dayDate },
      endDate: { gte: dayDate },
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          stores: { select: { storeId: true } },
        },
      },
    },
  });

  const alerts: AlertInput[] = [];

  for (const absence of absences) {
    const storeIds = absence.employee.stores.map((s) => s.storeId);
    const name = `${absence.employee.firstName} ${absence.employee.lastName}`;

    // Find shifts for this employee on this date
    const shifts = await prisma.shift.findMany({
      where: {
        date: dayDate,
        employeeId: { equals: null }, // Shift was unassigned when absence was approved
        storeId: { in: storeIds },
      },
    });

    // Check ReplacementOffers for these shifts
    for (const shift of shifts) {
      const replacement = await prisma.replacementOffer.findFirst({
        where: {
          shiftId: shift.id,
          status: "FILLED",
        },
      });

      if (!replacement) {
        // Check if an OPEN replacement exists
        const openReplacement = await prisma.replacementOffer.findFirst({
          where: { shiftId: shift.id, status: "OPEN" },
        });

        alerts.push({
          type: "ABSENCE_NOT_REPLACED",
          severity: "WARNING",
          storeId: shift.storeId,
          date: dayDate,
          time: shift.startTime,
          title: `Absence non remplacée — ${name}`,
          contextKey: absence.id,
          details: {
            employeeId: absence.employeeId,
            employeeName: name,
            absenceId: absence.id,
            shiftId: shift.id,
            shiftTime: `${shift.startTime}-${shift.endTime}`,
            replacementStatus: openReplacement ? "OPEN" : "NONE",
          },
        });
      }
    }

    // Also check direct absence → replacement via absenceId
    const directReplacements = await prisma.replacementOffer.findMany({
      where: {
        absenceId: absence.id,
        status: { not: "FILLED" },
      },
      include: { shift: true },
    });

    for (const r of directReplacements) {
      if (!r.shift) continue;
      // Avoid duplicate: only add if not already covered by shift-based check above
      const alreadyAdded = alerts.some(
        (a) =>
          a.type === "ABSENCE_NOT_REPLACED" &&
          a.contextKey === absence.id &&
          a.storeId === r.storeId
      );
      if (!alreadyAdded) {
        alerts.push({
          type: "ABSENCE_NOT_REPLACED",
          severity: "WARNING",
          storeId: r.storeId,
          date: dayDate,
          time: r.shift.startTime,
          title: `Absence non remplacée — ${name}`,
          contextKey: absence.id,
          details: {
            employeeId: absence.employeeId,
            employeeName: name,
            absenceId: absence.id,
            shiftId: r.shiftId,
            replacementStatus: r.status,
          },
        });
      }
    }
  }

  return alerts;
}

/* ─── 3. Significant Lateness ────────────────── */

async function detectSignificantLateness(
  dateStr: string
): Promise<AlertInput[]> {
  const dayDate = new Date(dateStr + "T00:00:00Z");
  const dayEnd = new Date(dateStr + "T23:59:59Z");

  const lateClockIns = await prisma.clockIn.findMany({
    where: {
      clockInAt: { gte: dayDate, lte: dayEnd },
      status: "LATE",
      lateMinutes: { gt: 15 },
    },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      store: { select: { id: true, name: true } },
      shift: { select: { id: true, startTime: true, endTime: true } },
    },
  });

  return lateClockIns.map((c) => {
    const name = `${c.employee.firstName} ${c.employee.lastName}`;
    const time = new Date(c.clockInAt).toISOString().slice(11, 16);

    return {
      type: "SIGNIFICANT_LATENESS" as const,
      severity: (c.lateMinutes > 30 ? "CRITICAL" : "WARNING") as ManagerAlertSeverity,
      storeId: c.storeId,
      date: dayDate,
      time,
      title: `Retard ${c.lateMinutes} min — ${name}`,
      contextKey: c.id,
      details: {
        employeeId: c.employeeId,
        employeeName: name,
        clockInId: c.id,
        lateMinutes: c.lateMinutes,
        clockInAt: c.clockInAt.toISOString(),
        shiftStartTime: c.shift?.startTime || null,
        storeName: c.store.name,
      },
    };
  });
}

/* ─── 4. Incomplete Team ─────────────────────── */

async function detectIncompleteTeam(dateStr: string): Promise<AlertInput[]> {
  const dayDate = new Date(dateStr + "T00:00:00Z");
  const dayEnd = new Date(dateStr + "T23:59:59Z");
  const currentMin = nowMinutes();

  // Get all stores that have shifts today
  const stores = await prisma.store.findMany({
    where: {
      shifts: {
        some: {
          date: dayDate,
          employeeId: { not: null },
        },
      },
    },
    select: { id: true, name: true },
  });

  const alerts: AlertInput[] = [];

  for (const store of stores) {
    // Count shifts with assigned employees that should have started
    const expectedShifts = await prisma.shift.findMany({
      where: {
        storeId: store.id,
        date: dayDate,
        employeeId: { not: null },
      },
      select: { id: true, startTime: true, employeeId: true },
    });

    // Only count shifts whose startTime is in the past
    const pastShifts = expectedShifts.filter(
      (s) => parseTime(s.startTime) < currentMin
    );

    if (pastShifts.length === 0) continue;

    // Count distinct clock-ins for this store today
    const clockIns = await prisma.clockIn.findMany({
      where: {
        storeId: store.id,
        clockInAt: { gte: dayDate, lte: dayEnd },
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });

    const expected = pastShifts.length;
    const actual = clockIns.length;
    const gap = expected - actual;

    if (gap > 0) {
      alerts.push({
        type: "INCOMPLETE_TEAM",
        severity: gap >= 2 ? "CRITICAL" : "WARNING",
        storeId: store.id,
        date: dayDate,
        time: null,
        title: `Équipe incomplète — ${store.name} (${actual}/${expected})`,
        contextKey: "team",
        details: {
          storeName: store.name,
          expectedCount: expected,
          actualClockIns: actual,
          gap,
        },
      });
    }
  }

  return alerts;
}

/* ─── Orchestrator ───────────────────────────── */

export async function generateAllAlerts(
  dateStr: string
): Promise<{ created: number; skipped: number }> {
  const [storeAlerts, absenceAlerts, lateAlerts, teamAlerts] =
    await Promise.all([
      detectStoreNotOpened(dateStr),
      detectAbsenceNotReplaced(dateStr),
      detectSignificantLateness(dateStr),
      detectIncompleteTeam(dateStr),
    ]);

  const allAlerts = [
    ...storeAlerts,
    ...absenceAlerts,
    ...lateAlerts,
    ...teamAlerts,
  ];

  // Fetch manager/admin user IDs once for notifications
  const managerUsers = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] }, active: true },
    select: { id: true },
  });
  const managerIds = managerUsers.map((u) => u.id);

  let created = 0;
  let skipped = 0;

  for (const alert of allAlerts) {
    // Check if alert already exists to avoid duplicate notifications
    const existing = await prisma.managerAlert.findUnique({
      where: {
        type_storeId_date_contextKey: {
          type: alert.type,
          storeId: alert.storeId,
          date: alert.date,
          contextKey: alert.contextKey,
        },
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    try {
      await prisma.managerAlert.create({
        data: {
          type: alert.type,
          severity: alert.severity,
          storeId: alert.storeId,
          date: alert.date,
          time: alert.time,
          title: alert.title,
          details: JSON.stringify(alert.details),
          contextKey: alert.contextKey,
        },
      });
      created++;

      // Dispatch notification for new alert
      if (managerIds.length > 0) {
        const eventType =
          alert.type === "STORE_NOT_OPENED" ? "STORE_NOT_OPENED" : "MANAGER_ALERT";
        dispatchNotificationAsync({
          userIds: managerIds,
          eventType,
          context: {
            storeName: String(alert.details.storeName || ""),
            title: alert.title,
            time: alert.time || "",
          },
        });
      }
    } catch {
      skipped++;
    }
  }

  return { created, skipped };
}

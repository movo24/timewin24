import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import {
  computeShiftSnapshotHash,
  type HashableShift,
} from "@/lib/notifications/planning-hash";
import {
  formatDayLabel,
  formatWeekLabel,
} from "@/lib/notifications/planning-email";
import { applyNotifyRbac } from "@/lib/notifications/notify-helpers";
import { z } from "zod";

const querySchema = z
  .object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    storeId: z.string().optional(),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine(
    (d) => !d.periodStart || !d.periodEnd || d.periodStart <= d.periodEnd,
    {
      message: "periodStart doit être antérieur ou égal à periodEnd",
      path: ["periodEnd"],
    }
  );

export type NotificationStatus =
  | "NOT_SENT"          // jamais envoyé pour cette période
  | "SENT"              // envoyé et toujours synchronisé
  | "MODIFIED"          // envoyé puis le planning a changé
  | "FAILED"            // dernier envoi a échoué
  | "NO_EMAIL";         // employé sans email

export interface EmployeeNotificationStatus {
  employeeId: string;
  name: string;
  email: string | null;
  shiftCount: number;
  totalHours: number;
  status: NotificationStatus;
  lastSentAt: string | null;
  lastSentByName: string | null;
  isModifiedAfterSend: boolean;
  currentHash: string;
  lastSentHash: string | null;
}

export interface NotificationsListResponse {
  notifications: EmployeeNotificationStatus[];
  periodLabel: string;
  isSingleDay: boolean;
  totalEmployees: number;
  counts: Record<NotificationStatus, number>;
}

/**
 * GET /api/planning/notifications
 *
 * Returns the send status of each employee's planning for the period.
 * Used by the planning UI to display badges:
 *   - "Envoyé"  / "Non envoyé"  / "Modifié après envoi"  / "Échec"  / "Sans email"
 *
 * Compares the hash of the *current* planning vs the hash captured at last send.
 */
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const user = session!.user as {
      id: string;
      role: string;
      companyId: string | null;
    };

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      weekStart: url.searchParams.get("weekStart") ?? undefined,
      storeId: url.searchParams.get("storeId") ?? undefined,
      periodStart: url.searchParams.get("periodStart") ?? undefined,
      periodEnd: url.searchParams.get("periodEnd") ?? undefined,
    });
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { weekStart, storeId, periodStart, periodEnd } = parsed.data;

    // ─── Multi-tenant : Company du store ciblé (pour check cross-company) ─
    let requestedCompanyId: string | null = null;
    if (storeId) {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { companyId: true },
      });
      if (!store) {
        return errorResponse("Magasin introuvable", 404);
      }
      requestedCompanyId = store.companyId;
    }

    // ─── RBAC (via shared helper, unit-tested) ──────────────────────────
    const { storeIds } = await getAccessibleStoreIds();
    const rbac = applyNotifyRbac({
      role: user.role as Parameters<typeof applyNotifyRbac>[0]["role"],
      accessibleStoreIds: storeIds,
      requestedStoreId: storeId,
      userCompanyId: user.companyId,
      requestedCompanyId,
    });
    if (!rbac.ok) {
      return errorResponse(rbac.reason, rbac.status);
    }

    // ─── Period range ────────────────────────────────────────────────────
    const parseDate = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    };
    const rangeStart = parseDate(periodStart ?? weekStart);
    const rangeEndRaw = periodEnd
      ? parseDate(periodEnd)
      : new Date(
          Date.UTC(
            rangeStart.getUTCFullYear(),
            rangeStart.getUTCMonth(),
            rangeStart.getUTCDate() + 6
          )
        );
    const rangeEnd = new Date(
      Date.UTC(
        rangeEndRaw.getUTCFullYear(),
        rangeEndRaw.getUTCMonth(),
        rangeEndRaw.getUTCDate(),
        23, 59, 59
      )
    );

    const isSingleDay =
      rangeStart.getUTCFullYear() === rangeEndRaw.getUTCFullYear() &&
      rangeStart.getUTCMonth() === rangeEndRaw.getUTCMonth() &&
      rangeStart.getUTCDate() === rangeEndRaw.getUTCDate();

    const periodLabel = isSingleDay
      ? formatDayLabel(rangeStart.toISOString().slice(0, 10))
      : formatWeekLabel(weekStart);

    // ─── Load current shifts (multi-tenant: scope par companyId) ────────
    const shifts = await prisma.shift.findMany({
      where: {
        date: { gte: rangeStart, lte: rangeEnd },
        employeeId: { not: null },
        ...(storeId ? { storeId } : {}),
        ...(user.role !== "SUPER_ADMIN" && user.companyId
          ? { companyId: user.companyId }
          : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true } },
        store: { select: { name: true } },
      },
      orderBy: [{ employeeId: "asc" }, { date: "asc" }, { startTime: "asc" }],
    });

    // ─── Group by employee, compute current hash ─────────────────────────
    const byEmployee = new Map<
      string,
      {
        firstName: string;
        lastName: string;
        email: string | null;
        shifts: HashableShift[];
        totalHours: number;
      }
    >();

    for (const shift of shifts) {
      if (!shift.employee) continue;
      const { id, firstName, lastName, email } = shift.employee;
      if (!byEmployee.has(id)) {
        byEmployee.set(id, { firstName, lastName, email, shifts: [], totalHours: 0 });
      }
      const entry = byEmployee.get(id)!;
      const dateStr = shift.date.toISOString().slice(0, 10);
      const [sh, sm] = shift.startTime.split(":").map(Number);
      const [eh, em] = shift.endTime.split(":").map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm);
      if (mins < 0) mins += 24 * 60;

      entry.shifts.push({
        date: dateStr,
        startTime: shift.startTime,
        endTime: shift.endTime,
        storeName: shift.store.name,
      });
      entry.totalHours += mins / 60;
    }

    const employeeIds = Array.from(byEmployee.keys());
    if (employeeIds.length === 0) {
      const empty: NotificationsListResponse = {
        notifications: [],
        periodLabel,
        isSingleDay,
        totalEmployees: 0,
        counts: {
          NOT_SENT: 0, SENT: 0, MODIFIED: 0, FAILED: 0, NO_EMAIL: 0,
        },
      };
      return successResponse(empty);
    }

    // ─── Load latest PlanningNotification per employee for this exact period ─
    // Multi-tenant : scope par companyId aussi (audit RH par client).
    const lastNotifications = await prisma.planningNotification.findMany({
      where: {
        employeeId: { in: employeeIds },
        periodStart: rangeStart,
        periodEnd: rangeEndRaw,
        ...(storeId ? { storeId } : {}),
        ...(user.role !== "SUPER_ADMIN" && user.companyId
          ? { companyId: user.companyId }
          : {}),
      },
      include: {
        sentByUser: { select: { name: true } },
      },
      orderBy: { sentAt: "desc" },
    });

    // Keep only the most recent notification per employee
    // employeeId is nullable (legal-trace mode) — skip orphan rows here.
    const lastByEmployee = new Map<string, typeof lastNotifications[0]>();
    for (const n of lastNotifications) {
      if (!n.employeeId) continue;
      if (!lastByEmployee.has(n.employeeId)) {
        lastByEmployee.set(n.employeeId, n);
      }
    }

    // ─── Build per-employee status ───────────────────────────────────────
    const notifications: EmployeeNotificationStatus[] = [];
    const counts: Record<NotificationStatus, number> = {
      NOT_SENT: 0, SENT: 0, MODIFIED: 0, FAILED: 0, NO_EMAIL: 0,
    };

    for (const [empId, emp] of byEmployee) {
      const currentHash = computeShiftSnapshotHash(emp.shifts);
      const last = lastByEmployee.get(empId);

      let status: NotificationStatus;
      let isModifiedAfterSend = false;
      let lastSentAt: string | null = null;
      let lastSentByName: string | null = null;
      let lastSentHash: string | null = null;

      if (!last) {
        // No prior notification for this period
        status = !emp.email ? "NO_EMAIL" : "NOT_SENT";
      } else {
        lastSentAt = last.sentAt.toISOString();
        // Prefer live user name; fall back to the snapshot if user was deleted
        lastSentByName = last.sentByUser?.name ?? last.sentByUserSnapshot ?? null;
        lastSentHash = last.shiftSnapshotHash;

        if (last.status === "FAILED") {
          status = "FAILED";
        } else if (last.status === "NO_EMAIL") {
          // If the employee gained an email since last attempt, treat as NOT_SENT
          status = emp.email ? "NOT_SENT" : "NO_EMAIL";
        } else if (last.status === "SENT") {
          if (lastSentHash && lastSentHash !== currentHash) {
            status = "MODIFIED";
            isModifiedAfterSend = true;
          } else {
            status = "SENT";
          }
        } else {
          // PARTIAL or unknown — treat as NOT_SENT to be safe
          status = "NOT_SENT";
        }
      }

      counts[status]++;
      notifications.push({
        employeeId: empId,
        name: `${emp.firstName} ${emp.lastName}`,
        email: emp.email,
        shiftCount: emp.shifts.length,
        totalHours: emp.totalHours,
        status,
        lastSentAt,
        lastSentByName,
        isModifiedAfterSend,
        currentHash,
        lastSentHash,
      });
    }

    // Stable order: alphabetical by name
    notifications.sort((a, b) => a.name.localeCompare(b.name));

    const response: NotificationsListResponse = {
      notifications,
      periodLabel,
      isSingleDay,
      totalEmployees: notifications.length,
      counts,
    };
    return successResponse(response);
  } catch (err) {
    console.error("Planning notifications GET error:", err);
    return errorResponse("Erreur interne lors de la lecture des statuts", 500);
  }
}

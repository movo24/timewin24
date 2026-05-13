import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { sendEmail, isEmailConfigured } from "@/lib/notifications/email";
import {
  buildPlanningEmailHtml,
  computeShiftHours,
  formatDayLabel,
  formatWeekLabel,
  type ShiftRow,
} from "@/lib/notifications/planning-email";
import { computeShiftSnapshotHash } from "@/lib/notifications/planning-hash";
import { applyNotifyRbac } from "@/lib/notifications/notify-helpers";
import { z } from "zod";

const notifySchema = z
  .object({
    /** Monday of the week — used to derive the period unless periodStart/periodEnd are given. */
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Filter to a single store. */
    storeId: z.string().optional(),
    /** Target a single employee (individual send). */
    employeeId: z.string().optional(),
    /**
     * If true: compute the preview without sending any emails.
     * Returns the same shape as a real send but with status === 'preview'.
     */
    dryRun: z.boolean().optional().default(false),
    /**
     * Override start of the period (ISO date "YYYY-MM-DD").
     * Defaults to weekStart.
     */
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /**
     * Override end of the period (ISO date "YYYY-MM-DD").
     * Defaults to weekStart + 6 days.
     */
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /**
     * If true: only target employees whose planning has been modified since their
     * last successful send (or who were never sent). Skips already-sent + unchanged.
     */
    modifiedOnly: z.boolean().optional().default(false),
  })
  .refine(
    (d) => !d.periodStart || !d.periodEnd || d.periodStart <= d.periodEnd,
    {
      message: "periodStart doit être antérieur ou égal à periodEnd",
      path: ["periodEnd"],
    }
  );

export type NotifyEmployeeResult = {
  employeeId: string;
  name: string;
  email: string | null;
  shiftCount: number;
  totalHours: number;
  status: "sent" | "failed" | "no_email" | "preview";
  error?: string;
};

export type NotifyResponse = {
  results: NotifyEmployeeResult[];
  sent: number;
  failed: number;
  noEmail: number;
  periodLabel: string;
  isSingleDay: boolean;
};

/** Concurrent send batch size (Resend free tier ≈ 10 emails/sec). */
const SEND_BATCH_SIZE = 10;
/** Pause between batches to stay under rate limits. */
const SEND_BATCH_PAUSE_MS = 1000;

/**
 * POST /api/planning/notify
 *
 * Sends (or previews) each employee's individual schedule by email.
 *
 * Modes:
 * - dryRun=false (default): sends emails and returns per-employee results
 * - dryRun=true: returns preview data without sending anything
 * - employeeId provided: targets only that employee
 *
 * Respects: weekStart, storeId, periodStart/periodEnd overrides.
 * Manager RBAC is enforced regardless of dryRun.
 * Successful sends are logged to AuditLog.
 */
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const user = session!.user as { id: string; role: string };

    const body = await req.json();
    const parsed = notifySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { weekStart, storeId, employeeId, dryRun, periodStart, periodEnd, modifiedOnly } =
      parsed.data;

    // RBAC: applied via shared, unit-tested helper (notify-rbac-batch.test.ts)
    const { storeIds } = await getAccessibleStoreIds();
    const rbac = applyNotifyRbac({
      role: user.role as Parameters<typeof applyNotifyRbac>[0]["role"],
      accessibleStoreIds: storeIds,
      requestedStoreId: storeId,
    });
    if (!rbac.ok) {
      return errorResponse(rbac.reason, rbac.status);
    }

    // Defense in depth: if a Manager passes employeeId, ensure the employee
    // belongs to one of their accessible stores. Prevents enumerating planning
    // of employees outside their scope (even though storeId filter blocks data).
    if (employeeId && user.role === "MANAGER" && storeIds) {
      const empAccess = await prisma.storeEmployee.findFirst({
        where: { employeeId, storeId: { in: storeIds } },
        select: { storeId: true },
      });
      if (!empAccess) {
        return errorResponse(
          "Accès refusé : cet employé n'est pas dans votre périmètre",
          403
        );
      }
    }

    // Only enforce SMTP when actually sending
    if (!dryRun && !isEmailConfigured()) {
      return errorResponse(
        "Notifications email non configurées — vérifiez SMTP_HOST, SMTP_USER, SMTP_PASS",
        503
      );
    }

    // ─── Build the date range ────────────────────────────────────────────────
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

    // ─── Load shifts ─────────────────────────────────────────────────────────
    const shiftsDb = await prisma.shift.findMany({
      where: {
        date: { gte: rangeStart, lte: rangeEnd },
        employeeId: employeeId ? employeeId : { not: null },
        ...(storeId ? { storeId } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true } },
        store: { select: { name: true } },
      },
      orderBy: [{ employeeId: "asc" }, { date: "asc" }, { startTime: "asc" }],
    });

    // ─── Group by employee ───────────────────────────────────────────────────
    const byEmployee = new Map<
      string,
      {
        firstName: string;
        lastName: string;
        email: string | null;
        shifts: ShiftRow[];
        totalHours: number;
      }
    >();

    for (const shift of shiftsDb) {
      if (!shift.employee) continue;
      const { id, firstName, lastName, email } = shift.employee;

      if (!byEmployee.has(id)) {
        byEmployee.set(id, { firstName, lastName, email, shifts: [], totalHours: 0 });
      }

      const entry = byEmployee.get(id)!;
      const dateStr = shift.date.toISOString().slice(0, 10);
      // Handles overnight shifts (e.g. 22:00 → 06:00)
      const hours = computeShiftHours(shift.startTime, shift.endTime);

      entry.shifts.push({
        date: dateStr,
        dayLabel: formatDayLabel(dateStr),
        storeName: shift.store.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        hours,
      });
      entry.totalHours += hours;
    }

    // ─── Build period label ──────────────────────────────────────────────────
    const isSingleDay =
      rangeStart.getUTCFullYear() === rangeEndRaw.getUTCFullYear() &&
      rangeStart.getUTCMonth() === rangeEndRaw.getUTCMonth() &&
      rangeStart.getUTCDate() === rangeEndRaw.getUTCDate();

    const periodLabel = isSingleDay
      ? formatDayLabel(rangeStart.toISOString().slice(0, 10))
      : formatWeekLabel(weekStart);

    const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;

    // ─── modifiedOnly filtering ──────────────────────────────────────────────
    // Skip employees whose last successful send hash matches the current planning.
    if (modifiedOnly && byEmployee.size > 0) {
      const lastNotifs = await prisma.planningNotification.findMany({
        where: {
          employeeId: { in: Array.from(byEmployee.keys()) },
          periodStart: rangeStart,
          periodEnd: rangeEndRaw,
          status: "SENT",
          ...(storeId ? { storeId } : {}),
        },
        orderBy: { sentAt: "desc" },
        select: { employeeId: true, shiftSnapshotHash: true },
      });
      const lastHashByEmployee = new Map<string, string | null>();
      for (const n of lastNotifs) {
        if (!n.employeeId) continue; // orphan audit row — skip
        if (!lastHashByEmployee.has(n.employeeId)) {
          lastHashByEmployee.set(n.employeeId, n.shiftSnapshotHash);
        }
      }
      // Drop employees whose hash is unchanged since last successful send
      for (const [empId, emp] of byEmployee) {
        const lastHash = lastHashByEmployee.get(empId);
        if (lastHash) {
          const currentHash = computeShiftSnapshotHash(
            emp.shifts.map((s) => ({
              date: s.date,
              startTime: s.startTime,
              endTime: s.endTime,
              storeName: s.storeName,
            }))
          );
          if (currentHash === lastHash) {
            byEmployee.delete(empId);
          }
        }
      }
    }

    // ─── Dry run: return preview without sending ─────────────────────────────
    if (dryRun) {
      const results: NotifyEmployeeResult[] = Array.from(byEmployee.entries()).map(
        ([id, emp]) => ({
          employeeId: id,
          name: `${emp.firstName} ${emp.lastName}`,
          email: emp.email,
          shiftCount: emp.shifts.length,
          totalHours: emp.totalHours,
          status: "preview",
        })
      );

      return successResponse({
        results,
        sent: 0,
        failed: 0,
        noEmail: results.filter((r) => !r.email).length,
        periodLabel,
        isSingleDay,
      });
    }

    // ─── Real send (batched for rate-limit safety) ──────────────────────────
    const entries = Array.from(byEmployee.entries());
    const results: NotifyEmployeeResult[] = new Array(entries.length);

    /** PlanningNotification rows to persist after the batch. */
    const dbRows: Array<{
      employeeId: string;
      employeeSnapshot: string;
      emailUsed: string | null;
      storeId: string | null;
      periodStart: Date;
      periodEnd: Date;
      sentByUserId: string;
      sentByUserSnapshot: string;
      status: "SENT" | "FAILED" | "NO_EMAIL";
      shiftCount: number;
      totalHours: number;
      error: string | null;
      shiftSnapshotHash: string | null;
    }> = [];

    // Snapshot the sender's display name once for all rows in this request
    const senderSnapshot = await prisma.user
      .findUnique({ where: { id: user.id }, select: { name: true } })
      .then((u) => u?.name ?? "Utilisateur inconnu")
      .catch(() => "Utilisateur inconnu");

    async function sendOne(index: number, id: string, emp: typeof entries[0][1]) {
      const employeeSnapshot = `${emp.firstName} ${emp.lastName}`.trim();
      const snapshotHash = computeShiftSnapshotHash(emp.shifts);

      // Wrap everything in try/catch so a single employee crash doesn't
      // bring down the whole batch (Promise.allSettled adds extra safety).
      try {
        if (!emp.email) {
          results[index] = {
            employeeId: id,
            name: employeeSnapshot,
            email: null,
            shiftCount: emp.shifts.length,
            totalHours: emp.totalHours,
            status: "no_email",
          };
          dbRows.push({
            employeeId: id,
            employeeSnapshot,
            emailUsed: null,
            storeId: storeId ?? null,
            periodStart: rangeStart,
            periodEnd: rangeEndRaw,
            sentByUserId: user.id,
            sentByUserSnapshot: senderSnapshot,
            status: "NO_EMAIL",
            shiftCount: emp.shifts.length,
            totalHours: emp.totalHours,
            error: null,
            shiftSnapshotHash: snapshotHash,
          });
          return;
        }

        const html = buildPlanningEmailHtml({
          employeeFirstName: emp.firstName,
          weekLabel: periodLabel,
          shifts: emp.shifts,
          totalHours: emp.totalHours,
          appUrl,
          isSingleDay,
        });

        const sendResult = await sendEmail({
          to: emp.email,
          subject: `Votre planning — ${periodLabel}`,
          title: `Planning ${periodLabel}`,
          body: "",
          rawHtml: html,
        });

        results[index] = {
          employeeId: id,
          name: employeeSnapshot,
          email: emp.email,
          shiftCount: emp.shifts.length,
          totalHours: emp.totalHours,
          status: sendResult.success ? "sent" : "failed",
          error: sendResult.success ? undefined : sendResult.error,
        };
        dbRows.push({
          employeeId: id,
          employeeSnapshot,
          emailUsed: emp.email,
          storeId: storeId ?? null,
          periodStart: rangeStart,
          periodEnd: rangeEndRaw,
          sentByUserId: user.id,
          sentByUserSnapshot: senderSnapshot,
          status: sendResult.success ? "SENT" : "FAILED",
          shiftCount: emp.shifts.length,
          totalHours: emp.totalHours,
          error: sendResult.success ? null : sendResult.error ?? null,
          shiftSnapshotHash: snapshotHash,
        });
      } catch (sendErr) {
        // Catch-all so an unexpected throw (template build, etc.) is recorded as FAILED
        // and doesn't prevent persistence of the rest of the batch.
        const message =
          sendErr instanceof Error
            ? `Erreur interne: ${sendErr.message.slice(0, 80)}`
            : "Erreur interne d'envoi";
        results[index] = {
          employeeId: id,
          name: employeeSnapshot,
          email: emp.email,
          shiftCount: emp.shifts.length,
          totalHours: emp.totalHours,
          status: "failed",
          error: message,
        };
        dbRows.push({
          employeeId: id,
          employeeSnapshot,
          emailUsed: emp.email,
          storeId: storeId ?? null,
          periodStart: rangeStart,
          periodEnd: rangeEndRaw,
          sentByUserId: user.id,
          sentByUserSnapshot: senderSnapshot,
          status: "FAILED",
          shiftCount: emp.shifts.length,
          totalHours: emp.totalHours,
          error: message,
          shiftSnapshotHash: snapshotHash,
        });
      }
    }

    for (let i = 0; i < entries.length; i += SEND_BATCH_SIZE) {
      const batch = entries.slice(i, i + SEND_BATCH_SIZE);
      // allSettled (not all): even if a Promise unexpectedly rejects, every
      // employee is still processed and persisted.
      await Promise.allSettled(
        batch.map(([id, emp], localIdx) => sendOne(i + localIdx, id, emp))
      );
      // Pause between batches except after the last one
      if (i + SEND_BATCH_SIZE < entries.length) {
        await new Promise((r) => setTimeout(r, SEND_BATCH_PAUSE_MS));
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const noEmail = results.filter((r) => r.status === "no_email").length;

    // ─── Persist PlanningNotification rows (legal/RH trace) ─────────────────
    // We use createMany so a single batch failure is logged but doesn't block the response.
    if (dbRows.length > 0) {
      try {
        await prisma.planningNotification.createMany({
          data: dbRows.map((r) => ({
            employeeId: r.employeeId,
            employeeSnapshot: r.employeeSnapshot,
            emailUsed: r.emailUsed,
            storeId: r.storeId,
            periodStart: r.periodStart,
            periodEnd: r.periodEnd,
            sentByUserId: r.sentByUserId,
            sentByUserSnapshot: r.sentByUserSnapshot,
            status: r.status,
            shiftCount: r.shiftCount,
            totalHours: r.totalHours,
            error: r.error,
            shiftSnapshotHash: r.shiftSnapshotHash,
          })),
        });
      } catch (dbErr) {
        // Trace persistence must never block the user response
        console.error("PlanningNotification persist error:", dbErr);
      }
    }

    // ─── Audit log (general activity log) ───────────────────────────────────
    await logAudit(
      user.id,
      "CREATE",
      "planning_notification",
      employeeId ?? `${storeId ?? "all"}_${weekStart}`,
      {
        weekStart,
        storeId: storeId ?? null,
        employeeId: employeeId ?? null,
        periodStart: periodStart ?? weekStart,
        periodEnd: periodEnd ?? null,
        periodLabel,
        sent,
        failed,
        noEmail,
        recipients: results
          .filter((r) => r.status === "sent")
          .map((r) => r.employeeId),
      }
    );

    return successResponse({
      results,
      sent,
      failed,
      noEmail,
      periodLabel,
      isSingleDay,
    });
  } catch (err) {
    console.error("Planning notify error:", err);
    return errorResponse("Erreur interne lors de l'envoi des notifications", 500);
  }
}

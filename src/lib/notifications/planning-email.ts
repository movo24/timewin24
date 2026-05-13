/**
 * Builds the rich HTML email sent to an employee with their weekly schedule.
 */

export interface ShiftRow {
  date: string;       // "2026-04-14"
  dayLabel: string;   // "Lun. 14 avr."
  storeName: string;
  startTime: string;  // "08:00"
  endTime: string;    // "16:00"
  hours: number;
}

export interface PlanningEmailParams {
  employeeFirstName: string;
  weekLabel: string;   // e.g. "semaine du 14 au 20 avril 2026"
  shifts: ShiftRow[];
  totalHours: number;
  appUrl?: string;
  /** When true, the period is a single day → uses "Total journée" instead of "Total semaine". */
  isSingleDay?: boolean;
}

const DAY_FR = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const MONTH_FR = [
  "jan.", "fév.", "mar.", "avr.", "mai", "juin",
  "juil.", "août", "sep.", "oct.", "nov.", "déc.",
];

/** Escape HTML entities to prevent XSS in email templates. */
export function escHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Compute hours between two "HH:mm" strings, handling shifts that cross midnight. */
export function computeShiftHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60; // overnight shift
  return minutes / 60;
}

export function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay();
  return `${DAY_FR[dow]} ${d} ${MONTH_FR[m - 1]}`;
}

export function formatWeekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 6));
  const sm = MONTH_FR[start.getUTCMonth()];
  const em = MONTH_FR[end.getUTCMonth()];
  const ey = end.getUTCFullYear();
  if (sm === em) {
    return `semaine du ${start.getUTCDate()} au ${end.getUTCDate()} ${em} ${ey}`;
  }
  return `semaine du ${start.getUTCDate()} ${sm} au ${end.getUTCDate()} ${em} ${ey}`;
}

export function buildPlanningEmailHtml(params: PlanningEmailParams): string {
  const { employeeFirstName, weekLabel, shifts, totalHours, appUrl, isSingleDay } = params;

  const totalLabel = isSingleDay ? "Total journée" : "Total semaine";
  const noShiftsLabel = isSingleDay ? "Aucun shift prévu ce jour." : "Aucun shift prévu cette semaine.";

  const shiftRows = shifts
    .map(
      (s) => `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 12px;font-size:13px;color:#374151;white-space:nowrap;">${escHtml(s.dayLabel)}</td>
        <td style="padding:10px 12px;font-size:13px;color:#111827;font-weight:600;white-space:nowrap;">${escHtml(s.startTime)} – ${escHtml(s.endTime)}</td>
        <td style="padding:10px 12px;font-size:13px;color:#6b7280;white-space:nowrap;">${escHtml(s.storeName)}</td>
        <td style="padding:10px 12px;font-size:13px;color:#6b7280;text-align:right;white-space:nowrap;">${s.hours.toFixed(1)}h</td>
      </tr>`
    )
    .join("");

  const buttonHtml = appUrl
    ? `<a href="${escHtml(appUrl)}" style="display:inline-block;margin-top:20px;padding:10px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Voir mon planning</a>`
    : "";

  const noShiftsHtml = `<p style="margin:16px 0;color:#6b7280;font-size:14px;">${noShiftsLabel}</p>`;

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;background:#f3f4f6;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#111827;padding:18px 24px;display:flex;align-items:center;gap:10px;">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">TimeWin</span>
      <span style="margin-left:auto;color:#9ca3af;font-size:12px;">Planning</span>
    </div>

    <!-- Body -->
    <div style="padding:28px 24px 20px;">
      <h1 style="margin:0 0 4px;font-size:18px;color:#111827;font-weight:700;">Bonjour ${escHtml(employeeFirstName)} 👋</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Voici votre planning pour la <strong style="color:#374151;">${escHtml(weekLabel)}</strong>.</p>

      ${
        shifts.length > 0
          ? `<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <thead>
                <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb;">
                  <th style="padding:8px 12px;font-size:11px;color:#9ca3af;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Jour</th>
                  <th style="padding:8px 12px;font-size:11px;color:#9ca3af;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Horaire</th>
                  <th style="padding:8px 12px;font-size:11px;color:#9ca3af;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Magasin</th>
                  <th style="padding:8px 12px;font-size:11px;color:#9ca3af;text-align:right;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Durée</th>
                </tr>
              </thead>
              <tbody>${shiftRows}</tbody>
            </table>
            <p style="margin:12px 0 0;font-size:13px;color:#374151;text-align:right;">
              <strong>${totalLabel} :</strong> ${totalHours.toFixed(1)}h
            </p>`
          : noShiftsHtml
      }

      ${buttonHtml}
    </div>

    <!-- Footer -->
    <div style="padding:14px 24px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;">
      TimeWin — Gestion de Planning &nbsp;·&nbsp; Ce message est envoyé automatiquement, ne pas répondre.
    </div>
  </div>
</body>
</html>`.trim();
}

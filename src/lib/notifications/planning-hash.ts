/**
 * Deterministic snapshot hash of an employee's shifts for a period.
 * Used to detect "planning modified after sent" without storing every shift row.
 *
 * Same input → same hash (any platform, any time).
 * Sort order doesn't matter (function sorts internally).
 */
import crypto from "crypto";

export interface HashableShift {
  date: string;          // "YYYY-MM-DD"
  startTime: string;     // "HH:mm"
  endTime: string;       // "HH:mm"
  storeName: string;
}

export function computeShiftSnapshotHash(rows: HashableShift[]): string {
  const sorted = [...rows].sort((a, b) =>
    a.date === b.date
      ? a.startTime.localeCompare(b.startTime)
      : a.date.localeCompare(b.date)
  );
  const repr = sorted
    .map((s) => `${s.date}|${s.startTime}|${s.endTime}|${s.storeName}`)
    .join("\n");
  return crypto.createHash("sha256").update(repr).digest("hex");
}

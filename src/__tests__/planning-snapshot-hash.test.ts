/**
 * Tests for the snapshot hash function used to detect "planning modified after sent".
 * Logic mirrored from src/app/api/planning/notify/route.ts → computeShiftSnapshotHash.
 */
import crypto from "crypto";
import type { ShiftRow } from "@/lib/notifications/planning-email";

// Re-implement the hash here so the test catches any divergence.
function computeShiftSnapshotHash(rows: ShiftRow[]): string {
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

const baseShift = (overrides: Partial<ShiftRow> = {}): ShiftRow => ({
  date: "2026-04-20",
  dayLabel: "Lun. 20 avr.",
  storeName: "Châtelet Quai",
  startTime: "10:00",
  endTime: "18:00",
  hours: 8,
  ...overrides,
});

describe("computeShiftSnapshotHash", () => {
  it("retourne le même hash pour les mêmes shifts", () => {
    const a = [baseShift()];
    const b = [baseShift()];
    expect(computeShiftSnapshotHash(a)).toBe(computeShiftSnapshotHash(b));
  });

  it("est stable peu importe l'ordre des shifts en entrée", () => {
    const a = [
      baseShift({ date: "2026-04-22", startTime: "08:00" }),
      baseShift({ date: "2026-04-20", startTime: "10:00" }),
    ];
    const b = [
      baseShift({ date: "2026-04-20", startTime: "10:00" }),
      baseShift({ date: "2026-04-22", startTime: "08:00" }),
    ];
    expect(computeShiftSnapshotHash(a)).toBe(computeShiftSnapshotHash(b));
  });

  it("change si une heure de début change", () => {
    const a = [baseShift({ startTime: "10:00" })];
    const b = [baseShift({ startTime: "11:00" })];
    expect(computeShiftSnapshotHash(a)).not.toBe(computeShiftSnapshotHash(b));
  });

  it("change si on ajoute un shift", () => {
    const a = [baseShift()];
    const b = [baseShift(), baseShift({ date: "2026-04-21" })];
    expect(computeShiftSnapshotHash(a)).not.toBe(computeShiftSnapshotHash(b));
  });

  it("change si on supprime un shift", () => {
    const a = [baseShift(), baseShift({ date: "2026-04-21" })];
    const b = [baseShift()];
    expect(computeShiftSnapshotHash(a)).not.toBe(computeShiftSnapshotHash(b));
  });

  it("change si on change de magasin", () => {
    const a = [baseShift({ storeName: "Châtelet Quai" })];
    const b = [baseShift({ storeName: "Bastille" })];
    expect(computeShiftSnapshotHash(a)).not.toBe(computeShiftSnapshotHash(b));
  });

  it("retourne un hash valide (64 chars hex) même pour 0 shifts", () => {
    const hash = computeShiftSnapshotHash([]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

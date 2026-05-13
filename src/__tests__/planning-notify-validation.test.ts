/**
 * Tests for /api/planning/notify input validation logic.
 * Validates the Zod schema rules without making real DB/email calls.
 */
import { z } from "zod";

// ─── Recreate the schema from route.ts (must stay in sync) ──────────────
// If the route schema changes, update this test file to match.
const notifySchema = z
  .object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    storeId: z.string().optional(),
    employeeId: z.string().optional(),
    dryRun: z.boolean().optional().default(false),
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

describe("notifySchema (Zod validation)", () => {
  it("accepte un payload minimal valide", () => {
    const r = notifySchema.safeParse({ weekStart: "2026-04-20" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dryRun).toBe(false); // default
    }
  });

  it("accepte le mode dry-run", () => {
    const r = notifySchema.safeParse({
      weekStart: "2026-04-20",
      dryRun: true,
    });
    expect(r.success).toBe(true);
  });

  it("accepte un payload complet en mode jour", () => {
    const r = notifySchema.safeParse({
      weekStart: "2026-04-20",
      storeId: "store_123",
      periodStart: "2026-04-22",
      periodEnd: "2026-04-22",
      dryRun: false,
    });
    expect(r.success).toBe(true);
  });

  it("REFUSE un weekStart au format invalide", () => {
    const r = notifySchema.safeParse({ weekStart: "20-04-2026" });
    expect(r.success).toBe(false);
  });

  it("REFUSE un weekStart absent", () => {
    const r = notifySchema.safeParse({ storeId: "store_1" });
    expect(r.success).toBe(false);
  });

  // ─── Test critique : period inversée ───────────────────────────────────
  it("REFUSE periodStart > periodEnd", () => {
    const r = notifySchema.safeParse({
      weekStart: "2026-04-20",
      periodStart: "2026-04-25",
      periodEnd: "2026-04-22",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues[0].message;
      expect(msg).toContain("antérieur");
    }
  });

  it("ACCEPTE periodStart === periodEnd (jour unique)", () => {
    const r = notifySchema.safeParse({
      weekStart: "2026-04-20",
      periodStart: "2026-04-22",
      periodEnd: "2026-04-22",
    });
    expect(r.success).toBe(true);
  });

  it("ACCEPTE periodStart sans periodEnd (l'API calcule la fin)", () => {
    const r = notifySchema.safeParse({
      weekStart: "2026-04-20",
      periodStart: "2026-04-22",
    });
    expect(r.success).toBe(true);
  });
});

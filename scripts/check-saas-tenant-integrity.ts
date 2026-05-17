/**
 * Phase 4 — Vérification d'intégrité multi-tenant.
 *
 * Pour chaque table tenant-scopée :
 *   - compte les rows totales
 *   - compte les rows SANS companyId (orphelines, donc invisibles à toute query SaaS)
 *
 * Une intégrité parfaite = aucune orpheline.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";

const TENANT_TABLES = [
  "User",
  "Store",
  "Employee",
  "StoreEmployee",
  "Shift",
  "Unavailability",
  "PlanningNotification",
  "AuditLog",
  "HrMessage",
  "ClockIn",
  "AbsenceDeclaration",
];

async function main() {
  const url = fs.readFileSync("/tmp/neon-saas.url", "utf8").trim();
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log("════════ Intégrité multi-tenant — DB SaaS ════════\n");

  // 1. Combien de Companies ?
  const companies = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM "Company"`
  );
  console.log(`Companies         : ${companies[0].count.toString()}`);

  // 2. Tables tenant-scopées : rows totales + rows orphelines
  console.log("\n┌─ Tables tenant-scopées ──────────────┬────────┬───────────┐");
  console.log("│ Table                                │ rows   │ sans cId │");
  console.log("├──────────────────────────────────────┼────────┼───────────┤");

  let orphansTotal = 0;
  for (const table of TENANT_TABLES) {
    const total = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM "${table}"`
    );
    const orphans = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM "${table}" WHERE "companyId" IS NULL`
    );
    const rowCount = Number(total[0].count);
    const orphanCount = Number(orphans[0].count);
    orphansTotal += orphanCount;
    const status = orphanCount === 0 ? "✅" : "⚠";
    console.log(
      `│ ${table.padEnd(36)} │ ${String(rowCount).padStart(6)} │ ${status} ${String(orphanCount).padStart(7)} │`
    );
  }
  console.log("└──────────────────────────────────────┴────────┴───────────┘");

  // 3. Verdict
  console.log("");
  if (orphansTotal === 0) {
    console.log("✅ Intégrité multi-tenant PARFAITE — 0 orpheline");
  } else {
    console.log(`⚠ ${orphansTotal} row(s) orpheline(s) (companyId NULL)`);
    console.log("   Ces rows seront invisibles à toute query scopée par companyId.");
    console.log("   Acceptable seulement si elles sont des artefacts SUPER_ADMIN.");
  }

  // 4. Test isolation simulé : count par companyId
  const byCompany = await prisma.$queryRawUnsafe<
    { companyId: string | null; count: bigint }[]
  >(`
    SELECT "companyId", count(*)::bigint AS count
    FROM "Shift"
    GROUP BY "companyId"
    ORDER BY count DESC
  `);
  console.log("\n── Shifts par companyId ──");
  for (const row of byCompany) {
    console.log(`  ${row.companyId ?? "(null)"} → ${row.count.toString()} shifts`);
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

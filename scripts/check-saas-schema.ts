/**
 * Phase 3 — Vérification post-migration : schema SaaS multi-tenant complet.
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";

async function main() {
  const url = fs.readFileSync("/tmp/neon-saas.url", "utf8").trim();
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const p = new PrismaClient({ adapter });

  // 1. Tables totales
  const allTables = await p.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT count(*)::bigint AS count
    FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
  `);
  console.log(`Tables totales : ${allTables[0].count.toString()}`);

  // 2. Table Company présente
  const companyTable = await p.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT count(*)::bigint AS count
    FROM information_schema.tables
    WHERE table_name='Company' AND table_schema='public'
  `);
  console.log(`Table Company : ${companyTable[0].count.toString() === "1" ? "✅ présente" : "❌ ABSENTE"}`);

  // 3. Enum CompanyStatus
  const enumStatus = await p.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT count(*)::bigint AS count
    FROM pg_type WHERE typname='CompanyStatus'
  `);
  console.log(`Enum CompanyStatus : ${enumStatus[0].count.toString() === "1" ? "✅ présent" : "❌ ABSENT"}`);

  // 4. Valeur OWNER dans Role
  const ownerInRole = await p.$queryRawUnsafe<{ enumlabel: string }[]>(`
    SELECT enumlabel FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname='Role')
    ORDER BY enumsortorder
  `);
  console.log(`Enum Role values : ${ownerInRole.map((r) => r.enumlabel).join(", ")}`);
  console.log(`  → OWNER présent : ${ownerInRole.some((r) => r.enumlabel === "OWNER") ? "✅" : "❌"}`);

  // 5. companyId présent sur les 11 tables cibles
  const targets = [
    "User", "Store", "Employee", "StoreEmployee", "Shift",
    "Unavailability", "PlanningNotification", "AuditLog",
    "HrMessage", "ClockIn", "AbsenceDeclaration",
  ];
  const colsWithCompany = await p.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name='companyId' AND table_schema='public'
    ORDER BY table_name
  `);
  const found = new Set(colsWithCompany.map((c) => c.table_name));
  console.log(`\ncompanyId présent sur (${colsWithCompany.length} tables) :`);
  for (const t of targets) {
    console.log(`  ${found.has(t) ? "✅" : "❌"} ${t}`);
  }

  // 6. Indexes companyId
  const idx = await p.$queryRawUnsafe<{ indexname: string }[]>(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND indexname LIKE '%companyId%'
    ORDER BY indexname
  `);
  console.log(`\nIndexes companyId : ${idx.length}`);
  for (const i of idx) console.log(`  - ${i.indexname}`);

  // 7. Foreign keys vers Company
  const fks = await p.$queryRawUnsafe<{ conname: string; src: string; ondel: string }[]>(`
    SELECT
      con.conname,
      cl.relname AS src,
      CASE con.confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END AS ondel
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_class fcl ON fcl.oid = con.confrelid
    WHERE con.contype = 'f' AND fcl.relname = 'Company'
    ORDER BY cl.relname
  `);
  console.log(`\nForeign keys vers Company : ${fks.length}`);
  for (const f of fks) console.log(`  - ${f.src.padEnd(25)} ON DELETE ${f.ondel}`);

  await p.$disconnect();
}
main().catch((e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

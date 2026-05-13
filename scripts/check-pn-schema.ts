// Check that the PlanningNotification table in production matches the Prisma schema.
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const url = fs
    .readFileSync(path.join(process.cwd(), ".env.vercel.tmp"), "utf8")
    .match(/DATABASE_URL="([^"]+)"/)![1];
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const p = new PrismaClient({ adapter });

  const cols = await p.$queryRawUnsafe<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }[]>(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'PlanningNotification' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);

  console.log("PlanningNotification columns (" + cols.length + "):");
  for (const c of cols) {
    console.log(
      `  - ${c.column_name.padEnd(22)} ${c.data_type.padEnd(30)} nullable=${c.is_nullable}`
    );
  }

  // Check FK ondelete behaviors
  const fks = await p.$queryRawUnsafe<{
    conname: string;
    confdeltype: string;
  }[]>(`
    SELECT conname, confdeltype::text AS confdeltype
    FROM pg_constraint
    WHERE conrelid = 'public."PlanningNotification"'::regclass AND contype = 'f'
    ORDER BY conname
  `);
  console.log("\nFK behaviors:");
  for (const f of fks) {
    const action: Record<string, string> = {
      a: "NO ACTION",
      r: "RESTRICT",
      c: "CASCADE",
      n: "SET NULL",
      d: "SET DEFAULT",
    };
    console.log(`  - ${f.conname.padEnd(50)} ${action[f.confdeltype]}`);
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});

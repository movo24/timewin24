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
    is_nullable: string;
  }[]>(
    `SELECT column_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='PlanningNotification'
     ORDER BY ordinal_position`
  );
  const fks = await p.$queryRawUnsafe<{
    conname: string;
    confdeltype: string;
  }[]>(
    `SELECT conname, confdeltype::text AS confdeltype
     FROM pg_constraint
     WHERE conrelid = 'public."PlanningNotification"'::regclass AND contype='f'
     ORDER BY conname`
  );

  console.log("Columns:");
  for (const c of cols) {
    const flag = c.is_nullable === "YES" ? "?" : "!";
    console.log(`  ${flag} ${c.column_name}`);
  }
  console.log("\nFK ON DELETE:");
  // confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT
  const deletionType: Record<string, string> = {
    a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT",
  };
  for (const f of fks) {
    console.log(`  - ${f.conname} → ${deletionType[f.confdeltype] ?? f.confdeltype}`);
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});

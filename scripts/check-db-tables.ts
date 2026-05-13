// One-off diagnostic — list all tables in the configured DB
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const envFile = path.join(process.cwd(), ".env.vercel.tmp");
  const url = fs
    .readFileSync(envFile, "utf8")
    .match(/DATABASE_URL="([^"]+)"/)![1];
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const p = new PrismaClient({ adapter });
  const tables = await p.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
  );
  console.log("Tables in DB (" + tables.length + "):");
  for (const t of tables) console.log("  -", t.tablename);
  await p.$disconnect();
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});

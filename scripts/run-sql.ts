// Apply a raw SQL file using the production DATABASE_URL.
// Usage: npx tsx scripts/run-sql.ts path/to/file.sql
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const sqlPath = process.argv[2];
  if (!sqlPath) {
    console.error("Usage: tsx scripts/run-sql.ts path/to/file.sql");
    process.exit(1);
  }
  const envFile = path.join(process.cwd(), ".env.vercel.tmp");
  const url = fs
    .readFileSync(envFile, "utf8")
    .match(/DATABASE_URL="([^"]+)"/)![1];
  const sql = fs.readFileSync(sqlPath, "utf8");

  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const p = new PrismaClient({ adapter });

  console.log(`Executing ${sqlPath}…`);
  await p.$executeRawUnsafe(sql);
  console.log("OK.");
  await p.$disconnect();
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});

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

  const tableExists = await p.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM information_schema.tables WHERE table_name = 'PlanningNotification' AND table_schema = 'public'`
  );
  const enumExists = await p.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM pg_type WHERE typname = 'PlanningNotificationStatus'`
  );
  const indexes = await p.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'PlanningNotification' ORDER BY indexname`
  );
  const fks = await p.$queryRawUnsafe<{ conname: string }[]>(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'public."PlanningNotification"'::regclass AND contype = 'f' ORDER BY conname`
  );

  console.log("Table PlanningNotification :", tableExists[0].count.toString());
  console.log("Enum PlanningNotificationStatus :", enumExists[0].count.toString());
  console.log("Indexes (" + indexes.length + ") :");
  for (const i of indexes) console.log("  -", i.indexname);
  console.log("FK constraints (" + fks.length + ") :");
  for (const f of fks) console.log("  -", f.conname);

  await p.$disconnect();
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});

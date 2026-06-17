/**
 * Probe read-only de la DB SaaS Neon.
 * Liste users + companies pour diagnostiquer l'état du seed.
 *
 * Usage : DATABASE_URL='...' npx tsx scripts/probe-saas-db.ts
 *
 * Aucun écriture, juste des SELECT. Pas commité (script jetable).
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    const userCount = await prisma.user.count();
    const companyCount = await prisma.company.count();
    console.log(`Users    : ${userCount}`);
    console.log(`Companies: ${companyCount}`);
    console.log("");

    if (userCount > 0) {
      const users = await prisma.user.findMany({
        select: { email: true, role: true, companyId: true, active: true },
        orderBy: { email: "asc" },
        take: 50,
      });
      console.log("--- Users ---");
      users.forEach((u) =>
        console.log(
          `  ${u.email} | ${u.role} | company:${u.companyId ?? "null"} | active:${u.active}`,
        ),
      );
    }

    if (companyCount > 0) {
      const companies = await prisma.company.findMany({
        select: { id: true, name: true, status: true },
      });
      console.log("--- Companies ---");
      companies.forEach((c) =>
        console.log(`  ${c.name} | ${c.id} | ${c.status}`),
      );
    }
  } catch (e) {
    console.error(
      "DB error:",
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const REVIEW_PASSWORD = process.env.REVIEW_PASSWORD;
if (!REVIEW_PASSWORD) {
  console.error(
    "❌ REVIEW_PASSWORD env requis. Usage : REVIEW_PASSWORD='...' DATABASE_URL='...' npx tsx scripts/create-review-accounts.ts",
  );
  process.exit(1);
}

const ACCOUNTS = [
  { email: "review-manager@timewin24.app", name: "Apple Review Manager", role: "MANAGER" as const },
  { email: "review-employee@timewin24.app", name: "Apple Review Employee", role: "EMPLOYEE" as const },
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    const demoCompany = await prisma.company.findFirst({
      where: { name: "Demo Company" },
      select: { id: true, name: true, status: true },
    });
    if (!demoCompany) { console.error("❌ Demo Company introuvable"); process.exit(1); }
    if (demoCompany.status !== "ACTIVE") { console.error(`❌ Demo Company status=${demoCompany.status}`); process.exit(1); }

    console.log(`✅ Demo Company : ${demoCompany.id}`);

    const passwordHash = await bcrypt.hash(REVIEW_PASSWORD, 10);

    for (const acc of ACCOUNTS) {
      const baseData = {
        passwordHash,
        role: acc.role,
        active: true,
        companyId: demoCompany.id,
        mustChangePassword: false,
        failedAttempts: 0,
      };
      const user = await prisma.user.upsert({
        where: { email: acc.email },
        create: { ...baseData, email: acc.email, name: acc.name, loginCount: 0, passwordChangedAt: new Date() },
        update: { ...baseData, lockedUntil: null, passwordChangedAt: new Date() },
        select: { id: true, email: true, role: true, name: true },
      });
      console.log(`✅ ${user.role.padEnd(10)} : ${user.email} (${user.id})`);
    }

    console.log("");
    console.log("=".repeat(70));
    console.log("APPLE REVIEW TEST ACCOUNTS — copier dans App Store Connect Notes");
    console.log("=".repeat(70));
    for (const acc of ACCOUNTS) {
      console.log(`Email    : ${acc.email}`);
      console.log(`Password : ${REVIEW_PASSWORD}`);
      console.log(`Role     : ${acc.role}`);
      console.log("-".repeat(70));
    }
    console.log("Login URL: https://app.timewin24.com/login");
    console.log("=".repeat(70));
  } catch (e) {
    console.error("❌ Erreur :", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();

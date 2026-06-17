/**
 * Crée un compte admin OWNER attaché à "Demo Company" sur la DB SaaS Neon.
 *
 * - Email : ADMIN_EMAIL env ou "admin@timewin24.app"
 * - Password : ADMIN_PASSWORD env ou généré aléatoirement (16 chars)
 * - Role : OWNER (top niveau company-scoped — gère employés, sites, planning)
 * - Company : Demo Company (existante, statut ACTIVE)
 *
 * Idempotent : si le compte existe déjà avec cet email, le password est reset
 * et l'account réactivé.
 *
 * Usage :
 *   DATABASE_URL='...' npx tsx scripts/create-admin.ts
 *   DATABASE_URL='...' ADMIN_EMAIL='foo@bar.com' ADMIN_PASSWORD='Secret123!' npx tsx scripts/create-admin.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@timewin24.app";
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ||
  // 16 chars random base64 (safe pour passwords)
  randomBytes(12).toString("base64").replace(/[+/=]/g, "x").slice(0, 16);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    // 1. Récupérer Demo Company (créée par seed-saas)
    const demoCompany = await prisma.company.findFirst({
      where: { name: "Demo Company" },
      select: { id: true, name: true, status: true },
    });

    if (!demoCompany) {
      console.error(
        "❌ Demo Company introuvable. Lance d'abord `npx tsx prisma/seed-saas.ts`.",
      );
      process.exit(1);
    }

    if (demoCompany.status !== "ACTIVE") {
      console.error(
        `❌ Demo Company existe mais statut=${demoCompany.status} (attendu ACTIVE).`,
      );
      process.exit(1);
    }

    console.log(`✅ Demo Company trouvée : ${demoCompany.id}`);

    // 2. Upsert le compte admin
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const user = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      create: {
        email: ADMIN_EMAIL,
        name: "Admin TimeWin24",
        passwordHash,
        role: "OWNER",
        active: true,
        companyId: demoCompany.id,
        mustChangePassword: false,
        failedAttempts: 0,
        loginCount: 0,
        passwordChangedAt: new Date(),
      },
      update: {
        passwordHash,
        role: "OWNER",
        active: true,
        companyId: demoCompany.id,
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
      },
      select: { id: true, email: true, role: true, companyId: true },
    });

    console.log("");
    console.log("=".repeat(60));
    console.log("✅ Compte admin créé / mis à jour");
    console.log("=".repeat(60));
    console.log(`Email       : ${user.email}`);
    console.log(`Password    : ${ADMIN_PASSWORD}`);
    console.log(`Role        : ${user.role}`);
    console.log(`Company     : ${user.companyId} (Demo Company)`);
    console.log(`Login URL   : https://app.timewin24.com/login`);
    console.log("=".repeat(60));
    console.log("");
    console.log(
      "⚠ Note password en lieu sûr (gestionnaire de mots de passe).",
    );
  } catch (e) {
    console.error("❌ Erreur :", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();

/**
 * Seed SaaS — 2e Company "Beta" pour test d'isolation cross-company.
 *
 * Permet de valider que :
 *   - Une query scopée par companyId=A ne retourne JAMAIS rien de B (et inversement)
 *   - applyNotifyRbac refuse un cross-tenant
 *   - enforceCompanyScope lève CrossCompanyAccessError
 *
 * Données strictement fictives, distinctes de Demo Company.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import * as fs from "fs";

async function main() {
  const url = fs.readFileSync("/tmp/neon-saas.url", "utf8").trim();
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log("▶ Seed SaaS — Demo Company Beta");

  // 1. Company B
  let company = await prisma.company.findFirst({ where: { name: "Demo Company Beta" } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: "Demo Company Beta",
        country: "FR",
        timezone: "Europe/Paris",
        language: "fr",
        contactEmail: "beta-owner@timewin24.app",
        status: "ACTIVE",
        onboardingStep: 99,
      },
    });
    console.log(`  ✅ Company B : ${company.id}`);
  } else {
    console.log(`  ℹ Company B existante : ${company.id}`);
  }
  const companyId = company.id;

  // 2. Owner B
  const passwordHash = await bcrypt.hash("BetaOwner!2026", 10);
  const owner = await prisma.user.upsert({
    where: { email: "beta-owner@timewin24.app" },
    update: { passwordHash, role: "OWNER", active: true, companyId },
    create: {
      email: "beta-owner@timewin24.app",
      passwordHash,
      name: "Beta Owner",
      role: "OWNER",
      active: true,
      companyId,
    },
  });
  console.log(`  ✅ Owner B : ${owner.email}`);

  // 3. 1 Store + 1 Employee (minimal, juste pour le test d'isolation)
  let store = await prisma.store.findFirst({ where: { name: "Marseille Beta", companyId } });
  if (!store) {
    store = await prisma.store.create({
      data: {
        name: "Marseille Beta",
        city: "Marseille",
        address: "1 quai Beta, 13002",
        country: "FR",
        timezone: "Europe/Paris",
        status: "ACTIVE",
        companyId,
      },
    });
  }
  console.log(`  ✅ Store B : ${store.name} (${store.id})`);

  let emp = await prisma.employee.findFirst({ where: { email: "noah.beta@timewin24.app" } });
  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        firstName: "Noah",
        lastName: "Roussel",
        email: "noah.beta@timewin24.app",
        weeklyHours: 35,
        active: true,
        contractType: "CDI",
        priority: 1,
        shiftPreference: "JOURNEE",
        companyId,
      },
    });
  }
  console.log(`  ✅ Employee B : ${emp.firstName} ${emp.lastName}`);

  // 4. Link + 1 shift
  const link = await prisma.storeEmployee.findFirst({
    where: { employeeId: emp.id, storeId: store.id },
  });
  if (!link) {
    await prisma.storeEmployee.create({
      data: { storeId: store.id, employeeId: emp.id, companyId },
    });
  }

  const monday = new Date();
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);
  await prisma.shift.deleteMany({ where: { companyId, date: { gte: monday } } });
  await prisma.shift.create({
    data: {
      storeId: store.id,
      employeeId: emp.id,
      date: monday,
      startTime: "08:00",
      endTime: "16:00",
      companyId,
    },
  });
  console.log(`  ✅ 1 shift Company B`);

  console.log(`\n══════ Récap Demo Company Beta ══════`);
  console.log(`  Company ID    : ${companyId}`);
  console.log(`  OWNER login   : beta-owner@timewin24.app`);
  console.log(`  OWNER pwd     : BetaOwner!2026  ⚠ À CHANGER`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

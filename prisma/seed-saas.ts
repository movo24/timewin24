/**
 * Seed SaaS App Store — Demo Company avec données strictement fictives.
 *
 * Cible : DB SaaS dédiée uniquement (lecture URL depuis /tmp/neon-saas.url).
 * Idempotent : peut être ré-exécuté, met à jour si nécessaire.
 *
 * Aucune donnée réelle. Aucune correspondance avec employés/magasins/clients
 * de production. Tous les noms et emails sont fictifs et non-attribuables.
 *
 * Mot de passe par défaut OWNER : "DemoOwner!2026"
 *   → À CHANGER avant tout usage public / App Store Review.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import * as fs from "fs";

const OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL || "demo-owner@timewin24.app";
/**
 * Password OWNER de démo. Lue depuis DEMO_OWNER_PASSWORD si défini, sinon
 * fallback documenté. ⚠ À CHANGER avant toute mise en main d'un utilisateur
 * (notamment avant l'App Store Review).
 *
 * Bonnes pratiques :
 *   - Pour un seed local de test : laisser le fallback est OK.
 *   - Pour le compte démo Apple Review : définir DEMO_OWNER_PASSWORD via
 *     une variable d'environnement injectée hors du repo.
 */
const OWNER_PASSWORD_PLAIN = process.env.DEMO_OWNER_PASSWORD || "DemoOwner!2026";

async function main() {
  const url = fs.readFileSync("/tmp/neon-saas.url", "utf8").trim();
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log("▶ Seed SaaS — Demo Company (fictif)");
  console.log(`  Target: ${url.slice(0, 25)}... (eu-central-1)`);

  // ─── 1. Company ─────────────────────────────────────────────────────────
  let company = await prisma.company.findFirst({
    where: { name: "Demo Company" },
  });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: "Demo Company",
        country: "FR",
        timezone: "Europe/Paris",
        language: "fr",
        contactEmail: "demo-owner@timewin24.app",
        status: "ACTIVE",
        onboardingStep: 99, // onboarding "terminé" pour pouvoir tester directement
      },
    });
    console.log(`  ✅ Company créée : ${company.id} (Demo Company)`);
  } else {
    console.log(`  ℹ Company existante : ${company.id}`);
  }

  const companyId = company.id;

  // ─── 2. User OWNER ──────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(OWNER_PASSWORD_PLAIN, 10);
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { passwordHash, role: "OWNER", active: true, companyId },
    create: {
      email: OWNER_EMAIL,
      passwordHash,
      name: "Demo Owner",
      role: "OWNER",
      active: true,
      companyId,
    },
  });
  console.log(`  ✅ User OWNER : ${owner.email} (id: ${owner.id})`);

  // ─── 3. Stores (sites fictifs) ──────────────────────────────────────────
  const storesSeed = [
    { name: "Paris Demo", city: "Paris", address: "1 rue Démo, 75001" },
    { name: "Lyon Demo", city: "Lyon", address: "2 rue Démo, 69001" },
  ];
  const stores = [];
  for (const s of storesSeed) {
    const existing = await prisma.store.findFirst({
      where: { name: s.name, companyId },
    });
    const store = existing
      ? await prisma.store.update({
          where: { id: existing.id },
          data: { city: s.city, address: s.address },
        })
      : await prisma.store.create({
          data: {
            name: s.name,
            city: s.city,
            address: s.address,
            country: "FR",
            timezone: "Europe/Paris",
            status: "ACTIVE",
            companyId,
          },
        });
    stores.push(store);
    console.log(`  ✅ Store : ${store.name} (id: ${store.id})`);
  }

  // ─── 4. Horaires d'ouverture (lun-sam 09:00-19:00, dim fermé) ──────────
  for (const store of stores) {
    for (let dow = 0; dow <= 6; dow++) {
      const closed = dow === 0; // dimanche fermé
      const existing = await prisma.storeSchedule.findFirst({
        where: { storeId: store.id, dayOfWeek: dow },
      });
      if (!existing) {
        await prisma.storeSchedule.create({
          data: {
            storeId: store.id,
            dayOfWeek: dow,
            closed,
            openTime: closed ? null : "09:00",
            closeTime: closed ? null : "19:00",
          },
        });
      }
    }
  }
  console.log(`  ✅ StoreSchedule créés (lun-sam 09h-19h, dim fermé)`);

  // ─── 5. Employees (fictifs, noms NON liés à des personnes réelles) ─────
  const employeesSeed = [
    { firstName: "Alice", lastName: "Martin", email: "alice.demo@timewin24.app", weeklyHours: 35 },
    { firstName: "Karim", lastName: "Bernard", email: "karim.demo@timewin24.app", weeklyHours: 35 },
    { firstName: "Sofia", lastName: "Lopez", email: "sofia.demo@timewin24.app", weeklyHours: 28 },
  ];
  const employees = [];
  for (const e of employeesSeed) {
    const existing = await prisma.employee.findFirst({
      where: { email: e.email },
    });
    const emp = existing
      ? await prisma.employee.update({
          where: { id: existing.id },
          data: { weeklyHours: e.weeklyHours, active: true, companyId },
        })
      : await prisma.employee.create({
          data: {
            firstName: e.firstName,
            lastName: e.lastName,
            email: e.email,
            weeklyHours: e.weeklyHours,
            active: true,
            contractType: "CDI",
            priority: 1,
            shiftPreference: "JOURNEE",
            companyId,
          },
        });
    employees.push(emp);
    console.log(`  ✅ Employee : ${emp.firstName} ${emp.lastName} (id: ${emp.id})`);
  }

  // ─── 6. StoreEmployee links (chaque employé sur les 2 stores) ──────────
  for (const emp of employees) {
    for (const store of stores) {
      const existing = await prisma.storeEmployee.findFirst({
        where: { employeeId: emp.id, storeId: store.id },
      });
      if (!existing) {
        await prisma.storeEmployee.create({
          data: {
            storeId: store.id,
            employeeId: emp.id,
            companyId,
          },
        });
      }
    }
  }
  console.log(`  ✅ StoreEmployee links créés`);

  // ─── 7. Quelques shifts cette semaine (pour avoir du contenu visible) ──
  const monday = new Date();
  const day = monday.getUTCDay() || 7; // 1..7 (lundi=1)
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);

  // Supprimer les shifts existants pour ce seed (idempotent propre)
  await prisma.shift.deleteMany({
    where: { companyId, date: { gte: monday } },
  });

  const shiftsToCreate = [
    // Paris Demo
    { storeIdx: 0, empIdx: 0, dayOffset: 0, start: "09:00", end: "13:00" },
    { storeIdx: 0, empIdx: 1, dayOffset: 0, start: "13:00", end: "19:00" },
    { storeIdx: 0, empIdx: 0, dayOffset: 1, start: "09:00", end: "17:00" },
    { storeIdx: 0, empIdx: 2, dayOffset: 2, start: "10:00", end: "18:00" },
    // Lyon Demo
    { storeIdx: 1, empIdx: 1, dayOffset: 0, start: "09:00", end: "15:00" },
    { storeIdx: 1, empIdx: 2, dayOffset: 1, start: "11:00", end: "19:00" },
  ];
  for (const s of shiftsToCreate) {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + s.dayOffset);
    await prisma.shift.create({
      data: {
        storeId: stores[s.storeIdx].id,
        employeeId: employees[s.empIdx].id,
        date,
        startTime: s.start,
        endTime: s.end,
        companyId,
      },
    });
  }
  console.log(`  ✅ ${shiftsToCreate.length} shifts créés (semaine du ${monday.toISOString().slice(0, 10)})`);

  // ─── Récap final ────────────────────────────────────────────────────────
  console.log("\n══════ Récap Demo Company ══════");
  console.log(`  Company       : ${companyId}`);
  console.log(`  OWNER login   : ${OWNER_EMAIL}`);
  console.log(`  OWNER pwd     : ${OWNER_PASSWORD_PLAIN}  ⚠ À CHANGER`);
  console.log(`  Stores        : ${stores.length}`);
  console.log(`  Employees     : ${employees.length}`);
  console.log(`  Shifts        : ${shiftsToCreate.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { Role } from "../src/generated/prisma/enums";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const STORE_NAMES = [
  { name: "Paris Rivoli", city: "Paris", address: "55 rue de Rivoli, 75001" },
  { name: "Paris Marais", city: "Paris", address: "12 rue des Francs-Bourgeois, 75003" },
  { name: "Lyon Part-Dieu", city: "Lyon", address: "CC Part-Dieu, 69003" },
  { name: "Lyon Confluence", city: "Lyon", address: "112 Cours Charlemagne, 69002" },
  { name: "Marseille Vieux-Port", city: "Marseille", address: "15 Quai du Port, 13002" },
  { name: "Bordeaux Sainte-Catherine", city: "Bordeaux", address: "78 rue Sainte-Catherine, 33000" },
  { name: "Toulouse Capitole", city: "Toulouse", address: "Place du Capitole, 31000" },
  { name: "Nantes Passage Pommeraye", city: "Nantes", address: "Passage Pommeraye, 44000" },
  { name: "Lille Grand Place", city: "Lille", address: "22 Place du Général de Gaulle, 59000" },
  { name: "Strasbourg Petite France", city: "Strasbourg", address: "5 rue du Bain-aux-Plantes, 67000" },
];

const EMPLOYEES = [
  { firstName: "Jean", lastName: "Dupont", email: "jean.dupont@timewin.fr", weeklyHours: 35 },
  { firstName: "Marie", lastName: "Martin", email: "marie.martin@timewin.fr", weeklyHours: 35 },
  { firstName: "Pierre", lastName: "Bernard", email: "pierre.bernard@timewin.fr", weeklyHours: 35 },
  { firstName: "Sophie", lastName: "Petit", email: "sophie.petit@timewin.fr", weeklyHours: 28 },
  { firstName: "Lucas", lastName: "Robert", email: "lucas.robert@timewin.fr", weeklyHours: 35 },
  { firstName: "Emma", lastName: "Richard", email: "emma.richard@timewin.fr", weeklyHours: 35 },
  { firstName: "Hugo", lastName: "Durand", email: "hugo.durand@timewin.fr", weeklyHours: 20 },
  { firstName: "Léa", lastName: "Moreau", email: "lea.moreau@timewin.fr", weeklyHours: 35 },
  { firstName: "Louis", lastName: "Simon", email: "louis.simon@timewin.fr", weeklyHours: 35 },
  { firstName: "Chloé", lastName: "Laurent", email: "chloe.laurent@timewin.fr", weeklyHours: 28 },
  { firstName: "Nathan", lastName: "Lefebvre", email: "nathan.lefebvre@timewin.fr", weeklyHours: 35 },
  { firstName: "Camille", lastName: "Michel", email: "camille.michel@timewin.fr", weeklyHours: 35 },
  { firstName: "Antoine", lastName: "Garcia", email: "antoine.garcia@timewin.fr", weeklyHours: 35 },
  { firstName: "Manon", lastName: "David", email: "manon.david@timewin.fr", weeklyHours: 20 },
  { firstName: "Théo", lastName: "Bertrand", email: "theo.bertrand@timewin.fr", weeklyHours: 35 },
  { firstName: "Julie", lastName: "Roux", email: "julie.roux@timewin.fr", weeklyHours: 35 },
  { firstName: "Maxime", lastName: "Vincent", email: "maxime.vincent@timewin.fr", weeklyHours: 28 },
  { firstName: "Sarah", lastName: "Fournier", email: "sarah.fournier@timewin.fr", weeklyHours: 35 },
  { firstName: "Alexandre", lastName: "Morel", email: "alexandre.morel@timewin.fr", weeklyHours: 35 },
  { firstName: "Inès", lastName: "Girard", email: "ines.girard@timewin.fr", weeklyHours: 35 },
  { firstName: "Paul", lastName: "André", email: "paul.andre@timewin.fr", weeklyHours: 20 },
  { firstName: "Clara", lastName: "Lefevre", email: "clara.lefevre@timewin.fr", weeklyHours: 35 },
  { firstName: "Thomas", lastName: "Mercier", email: "thomas.mercier@timewin.fr", weeklyHours: 35 },
  { firstName: "Jade", lastName: "Dupuis", email: "jade.dupuis@timewin.fr", weeklyHours: 28 },
  { firstName: "Raphaël", lastName: "Lambert", email: "raphael.lambert@timewin.fr", weeklyHours: 35 },
  { firstName: "Alice", lastName: "Bonnet", email: "alice.bonnet@timewin.fr", weeklyHours: 35 },
  { firstName: "Gabriel", lastName: "François", email: "gabriel.francois@timewin.fr", weeklyHours: 35 },
  { firstName: "Zoé", lastName: "Martinez", email: "zoe.martinez@timewin.fr", weeklyHours: 20 },
  { firstName: "Arthur", lastName: "Legrand", email: "arthur.legrand@timewin.fr", weeklyHours: 35 },
  { firstName: "Lina", lastName: "Garnier", email: "lina.garnier@timewin.fr", weeklyHours: 35 },
];

const SHIFTS_TEMPLATES = [
  { startTime: "06:00", endTime: "14:00", note: "Ouverture" },
  { startTime: "09:00", endTime: "17:00", note: null },
  { startTime: "10:00", endTime: "18:00", note: null },
  { startTime: "14:00", endTime: "21:00", note: "Fermeture" },
  { startTime: "09:00", endTime: "13:00", note: "Demi-journée" },
  { startTime: "13:00", endTime: "17:00", note: "Après-midi" },
];

function getMondayOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

async function main() {
  console.log("Cleaning database...");
  await prisma.auditLog.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.storeEmployee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.store.deleteMany();

  console.log("Creating stores...");
  const stores = await Promise.all(
    STORE_NAMES.map((s) =>
      prisma.store.create({
        data: { name: s.name, city: s.city, address: s.address, timezone: "Europe/Paris" },
      })
    )
  );

  console.log("Creating employees...");
  const employees = await Promise.all(
    EMPLOYEES.map((e) =>
      prisma.employee.create({ data: e })
    )
  );

  // Assign employees to stores (3 employees per store, some overlap)
  console.log("Assigning employees to stores...");
  for (let i = 0; i < stores.length; i++) {
    const storeEmployees = [
      employees[i * 3 % employees.length],
      employees[(i * 3 + 1) % employees.length],
      employees[(i * 3 + 2) % employees.length],
    ];

    for (const emp of storeEmployees) {
      await prisma.storeEmployee.create({
        data: { storeId: stores[i].id, employeeId: emp.id },
      }).catch(() => {}); // Ignore duplicate
    }
  }

  // Create admin user
  console.log("Creating users...");
  const adminHash = await bcrypt.hash("admin123", 10);
  await prisma.user.create({
    data: {
      email: "admin@timewin.fr",
      passwordHash: adminHash,
      name: "Admin TimeWin",
      role: Role.ADMIN,
    },
  });

  // Create employee user (linked to first employee)
  const empHash = await bcrypt.hash("pass123", 10);
  await prisma.user.create({
    data: {
      email: "jean.dupont@timewin.fr",
      passwordHash: empHash,
      name: "Jean Dupont",
      role: Role.EMPLOYEE,
      employeeId: employees[0].id,
    },
  });

  // Create shifts for 2 weeks (current + next)
  console.log("Creating shifts for 2 weeks...");
  const monday = getMondayOfCurrentWeek();
  let shiftCount = 0;

  for (let weekOffset = 0; weekOffset < 2; weekOffset++) {
    for (let storeIdx = 0; storeIdx < stores.length; storeIdx++) {
      const store = stores[storeIdx];

      // Get employees assigned to this store
      const storeEmps = await prisma.storeEmployee.findMany({
        where: { storeId: store.id },
        select: { employeeId: true },
      });

      for (let dayOffset = 0; dayOffset < 6; dayOffset++) {
        // Monday to Saturday
        const date = new Date(monday);
        date.setDate(monday.getDate() + weekOffset * 7 + dayOffset);

        for (let empIdx = 0; empIdx < storeEmps.length; empIdx++) {
          const template = SHIFTS_TEMPLATES[
            (storeIdx + dayOffset + empIdx) % SHIFTS_TEMPLATES.length
          ];

          await prisma.shift.create({
            data: {
              storeId: store.id,
              employeeId: storeEmps[empIdx].employeeId,
              date,
              startTime: template.startTime,
              endTime: template.endTime,
              note: template.note,
            },
          });
          shiftCount++;
        }
      }
    }
  }

  // ─── Seed Country Config & Employee Costs ────────

  // Create France config
  const france = await prisma.countryConfig.upsert({
    where: { code: "FR" },
    update: {},
    create: {
      code: "FR",
      name: "France",
      currency: "EUR",
      minimumWageHour: 12.02,
      employerRate: 0.45,
      reductionEnabled: true,
      reductionMaxCoeff: 0.3206,
      reductionThreshold: 1.6,
      extraHourlyCost: 0,
      notes: "Paramètres France 2026 — SMIC au 01/01/2026",
    },
  });
  console.log(`Country config: ${france.code} — ${france.name}`);

  // Assign hourly rates to employees (varying rates for realism)
  const hourlyRates = [12.02, 12.50, 13.00, 14.00, 15.00, 12.02, 13.50, 16.00, 12.02, 14.50,
    12.02, 13.00, 15.50, 12.02, 14.00, 12.50, 13.00, 17.00, 12.02, 15.00,
    12.02, 13.50, 14.50, 12.02, 16.00, 12.50, 13.00, 18.00, 12.02, 15.00];

  let costConfigCount = 0;
  for (let i = 0; i < employees.length; i++) {
    await prisma.employeeCost.upsert({
      where: { employeeId: employees[i].id },
      update: {},
      create: {
        employeeId: employees[i].id,
        countryCode: "FR",
        hourlyRateGross: hourlyRates[i % hourlyRates.length],
      },
    });
    costConfigCount++;
  }
  console.log(`Employee cost configs: ${costConfigCount}`);

  console.log(`\nSeed complete!`);
  console.log(`- ${stores.length} stores`);
  console.log(`- ${employees.length} employees`);
  console.log(`- ${shiftCount} shifts`);
  console.log(`- 1 country config (FR)`);
  console.log(`- ${costConfigCount} employee cost configs`);
  console.log(`\nTest accounts:`);
  console.log(`  Admin:    admin@timewin.fr / admin123`);
  console.log(`  Employee: jean.dupont@timewin.fr / pass123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

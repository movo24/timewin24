import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function deleteIfExists(modelName: string, deleteFn: () => Promise<{ count: number }>) {
  try {
    const result = await deleteFn();
    console.log(`  ${modelName}: ${result.count} supprimés`);
  } catch {
    console.log(`  ${modelName}: table non trouvée (OK)`);
  }
}

async function main() {
  console.log("=== NETTOYAGE BASE DE PRODUCTION ===\n");

  // 1. Afficher l'état actuel
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true } });
  const stores = await prisma.store.findMany({ select: { id: true, name: true, city: true } });
  const employees = await prisma.employee.findMany({ select: { id: true, firstName: true, lastName: true } });
  const shifts = await prisma.shift.count();

  console.log("--- ETAT ACTUEL ---");
  console.log(`Users: ${users.length}`);
  users.forEach(u => console.log(`  - ${u.email} (${u.role})`));
  console.log(`Stores: ${stores.length}`);
  stores.forEach(s => console.log(`  - ${s.name} (${s.city})`));
  console.log(`Employees: ${employees.length}`);
  employees.forEach(e => console.log(`  - ${e.firstName} ${e.lastName}`));
  console.log(`Shifts: ${shifts}`);
  console.log("");

  // 2. Supprimer toutes les données dans le bon ordre (FK constraints)
  console.log("--- SUPPRESSION DES DONNEES DEMO ---");

  // Notifications & Push
  console.log("\n[Notifications]");
  await deleteIfExists("NotificationLog", () => prisma.notificationLog.deleteMany());
  await deleteIfExists("NotificationPreference", () => prisma.notificationPreference.deleteMany());
  await deleteIfExists("PushSubscription", () => prisma.pushSubscription.deleteMany());

  // Feed & Broadcasts
  console.log("\n[Feed & Broadcasts]");
  await deleteIfExists("FeedComment", () => prisma.feedComment.deleteMany());
  await deleteIfExists("FeedPost", () => prisma.feedPost.deleteMany());
  await deleteIfExists("BroadcastStore", () => prisma.broadcastStore.deleteMany());
  await deleteIfExists("Broadcast", () => prisma.broadcast.deleteMany());

  // Messages RH
  console.log("\n[Messages RH]");
  await deleteIfExists("MessageAttachment", () => prisma.messageAttachment.deleteMany());
  await deleteIfExists("HrMessage", () => prisma.hrMessage.deleteMany());

  // Replacements & Market
  console.log("\n[Remplacements & Marche]");
  await deleteIfExists("ReplacementCandidate", () => prisma.replacementCandidate.deleteMany());
  await deleteIfExists("ReplacementOffer", () => prisma.replacementOffer.deleteMany());
  await deleteIfExists("ShiftMarketListing", () => prisma.shiftMarketListing.deleteMany());
  await deleteIfExists("ShiftExchange", () => prisma.shiftExchange.deleteMany());

  // Shifts
  console.log("\n[Shifts]");
  await deleteIfExists("Shift", () => prisma.shift.deleteMany());

  // Clock-in & Absences
  console.log("\n[Pointages & Absences]");
  await deleteIfExists("ClockIn", () => prisma.clockIn.deleteMany());
  await deleteIfExists("AbsenceDeclaration", () => prisma.absenceDeclaration.deleteMany());

  // Alerts & Journal
  console.log("\n[Alertes & Journal]");
  await deleteIfExists("ManagerAlert", () => prisma.managerAlert.deleteMany());
  await deleteIfExists("JournalEntry", () => prisma.journalEntry.deleteMany());

  // Reliability
  console.log("\n[Fiabilite]");
  await deleteIfExists("ReliabilityScoreHistory", () => prisma.reliabilityScoreHistory.deleteMany());

  // Unavailabilities
  console.log("\n[Indisponibilites]");
  await deleteIfExists("Unavailability", () => prisma.unavailability.deleteMany());

  // POS
  console.log("\n[POS - Caisse]");
  await deleteIfExists("PosSyncLog", () => prisma.posSyncLog.deleteMany());
  await deleteIfExists("PosSalesData", () => prisma.posSalesData.deleteMany());
  await deleteIfExists("PosTimeClock", () => prisma.posTimeClock.deleteMany());
  await deleteIfExists("PosEmployeeLink", () => prisma.posEmployeeLink.deleteMany());
  await deleteIfExists("PosStoreLink", () => prisma.posStoreLink.deleteMany());
  await deleteIfExists("PosProvider", () => prisma.posProvider.deleteMany());

  // Audit logs
  console.log("\n[Audit]");
  await deleteIfExists("AuditLog", () => prisma.auditLog.deleteMany());

  // Employee costs
  console.log("\n[Couts]");
  await deleteIfExists("EmployeeCost", () => prisma.employeeCost.deleteMany());

  // Store-Employee links
  console.log("\n[Liens Store-Employee]");
  await deleteIfExists("StoreEmployee", () => prisma.storeEmployee.deleteMany());

  // Schedules
  console.log("\n[Horaires magasin]");
  await deleteIfExists("StoreSchedule", () => prisma.storeSchedule.deleteMany());

  // Country config
  console.log("\n[Config pays]");
  await deleteIfExists("CountryConfig", () => prisma.countryConfig.deleteMany());

  // Users (sauf admin)
  console.log("\n[Users & Employes & Magasins]");
  const delUsers = await prisma.user.deleteMany({
    where: { role: { not: "ADMIN" } }
  });
  console.log(`  Users non-admin: ${delUsers.count} supprimés`);

  // Supprimer tous les employés
  await deleteIfExists("Employee", () => prisma.employee.deleteMany());

  // Supprimer tous les stores
  await deleteIfExists("Store", () => prisma.store.deleteMany());

  console.log("\n--- SECURISATION COMPTE ADMIN ---");

  // 3. Mettre à jour le compte admin
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });

  if (admin) {
    await prisma.user.update({
      where: { id: admin.id },
      data: {
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
      }
    });
    console.log(`Admin ${admin.email} : mustChangePassword = true`);
    console.log("L'admin devra choisir un vrai mot de passe au prochain login.");
  } else {
    console.log("ERREUR: Aucun compte admin trouvé !");
  }

  // 4. Vérification finale
  console.log("\n--- ETAT FINAL ---");
  const finalUsers = await prisma.user.findMany({ select: { email: true, role: true, mustChangePassword: true } });
  const finalStores = await prisma.store.count();
  const finalEmployees = await prisma.employee.count();
  const finalShifts = await prisma.shift.count();

  console.log(`Users: ${finalUsers.length}`);
  finalUsers.forEach(u => console.log(`  - ${u.email} (${u.role}) mustChangePassword: ${u.mustChangePassword}`));
  console.log(`Stores: ${finalStores}`);
  console.log(`Employees: ${finalEmployees}`);
  console.log(`Shifts: ${finalShifts}`);

  console.log("\n=== BASE NETTOYEE - PRETE POUR PRODUCTION ===");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

/**
 * Phase 5 — Test d'isolation cross-company sur la VRAIE DB SaaS.
 *
 * Vérifie que :
 *   1. Une query scopée par companyId=A ne ramène RIEN de B (et inversement)
 *   2. enforceCompanyScope injecte le bon companyId
 *   3. enforceCompanyScope LÈVE CrossCompanyAccessError sur tentative cross-tenant
 *   4. applyNotifyRbac refuse cross-company même pour OWNER
 *   5. Le filtre Prisma `where: { companyId }` est respecté pour Shift, Employee, Store
 *
 * Aucune modification de données. Lecture + scénarios simulés.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import {
  enforceCompanyScope,
  CrossCompanyAccessError,
  type CompanyContext,
} from "../src/lib/company-context-pure";
import { applyNotifyRbac } from "../src/lib/notifications/notify-helpers";

let passed = 0;
let failed = 0;

function assert(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? "\n     " + detail : ""}`);
    failed++;
  }
}

async function main() {
  const url = fs.readFileSync("/tmp/neon-saas.url", "utf8").trim();
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log("════════ Test isolation cross-company — DB SaaS ════════\n");

  // ─── Setup : récupérer les 2 Company IDs ─────────────────────────────────
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const companyA = companies.find((c) => c.name === "Demo Company");
  const companyB = companies.find((c) => c.name === "Demo Company Beta");

  if (!companyA || !companyB) {
    console.error("❌ Les 2 companies ne sont pas seedées. Lance d'abord seed-saas et seed-saas-beta.");
    process.exit(1);
  }
  console.log(`Setup :`);
  console.log(`  Company A : ${companyA.name}  (${companyA.id})`);
  console.log(`  Company B : ${companyB.name}  (${companyB.id})\n`);

  // ─── Test 1 : Shifts scoped by companyId ─────────────────────────────────
  console.log("Test 1 — Filtre Prisma where: { companyId }");
  const shiftsA = await prisma.shift.findMany({ where: { companyId: companyA.id } });
  const shiftsB = await prisma.shift.findMany({ where: { companyId: companyB.id } });
  assert(`Company A voit ses propres shifts (${shiftsA.length})`, shiftsA.length === 6);
  assert(`Company B voit ses propres shifts (${shiftsB.length})`, shiftsB.length === 1);
  assert(`Aucun shift de A ne fuit dans B`, shiftsA.every((s) => s.companyId === companyA.id));
  assert(`Aucun shift de B ne fuit dans A`, shiftsB.every((s) => s.companyId === companyB.id));

  // ─── Test 2 : Cross-tenant query retourne vide ───────────────────────────
  console.log("\nTest 2 — Cross-tenant query attendu vide");
  // Prends un shiftId réel de A et cherche-le filtré par companyId=B → doit retourner null
  const oneShiftA = shiftsA[0];
  const tryStealFromB = await prisma.shift.findFirst({
    where: { id: oneShiftA.id, companyId: companyB.id },
  });
  assert("Manager B ne peut PAS lire un shift d'A en connaissant son id", tryStealFromB === null);

  // Inverse
  const oneShiftB = shiftsB[0];
  const tryStealFromA = await prisma.shift.findFirst({
    where: { id: oneShiftB.id, companyId: companyA.id },
  });
  assert("Manager A ne peut PAS lire un shift de B en connaissant son id", tryStealFromA === null);

  // ─── Test 3 : Employees / Stores isolation ───────────────────────────────
  console.log("\nTest 3 — Isolation Employees + Stores");
  const empsA = await prisma.employee.count({ where: { companyId: companyA.id } });
  const empsB = await prisma.employee.count({ where: { companyId: companyB.id } });
  assert(`Company A : 3 employés`, empsA === 3);
  assert(`Company B : 1 employé`, empsB === 1);

  const storesA = await prisma.store.count({ where: { companyId: companyA.id } });
  const storesB = await prisma.store.count({ where: { companyId: companyB.id } });
  assert(`Company A : 2 stores`, storesA === 2);
  assert(`Company B : 1 store`, storesB === 1);

  // ─── Test 4 : enforceCompanyScope ─────────────────────────────────────────
  console.log("\nTest 4 — enforceCompanyScope (helper)");
  const ctxOwnerA: CompanyContext = {
    userId: "owner_a",
    role: "OWNER",
    companyId: companyA.id,
    isPlatformAdmin: false,
  };
  const ctxOwnerB: CompanyContext = {
    userId: "owner_b",
    role: "OWNER",
    companyId: companyB.id,
    isPlatformAdmin: false,
  };

  const whereA = enforceCompanyScope({ active: true }, ctxOwnerA);
  assert(`OWNER A injecte companyId=A`, whereA.companyId === companyA.id);

  let threw = false;
  try {
    enforceCompanyScope({ companyId: companyB.id }, ctxOwnerA);
  } catch (e) {
    threw = e instanceof CrossCompanyAccessError;
  }
  assert(`OWNER A tentant cross-company B → CrossCompanyAccessError`, threw);

  // ─── Test 5 : Test bout-en-bout — OWNER A query Shift filtré par helper ──
  console.log("\nTest 5 — Bout en bout : OWNER A + Prisma + enforceCompanyScope");
  const whereScopedForA = enforceCompanyScope({}, ctxOwnerA);
  const shiftsViaHelper = await prisma.shift.findMany({ where: whereScopedForA });
  assert(`OWNER A via helper → ${shiftsViaHelper.length} shifts (= 6 attendus)`, shiftsViaHelper.length === 6);
  assert(
    `Aucun shift de B dans le résultat helper-scopé`,
    shiftsViaHelper.every((s) => s.companyId === companyA.id)
  );

  // ─── Test 6 : applyNotifyRbac cross-tenant ────────────────────────────────
  console.log("\nTest 6 — applyNotifyRbac SaaS — cross-tenant refusé");
  const rbacAcrossOK = applyNotifyRbac({
    role: "OWNER",
    accessibleStoreIds: null,
    userCompanyId: companyA.id,
    requestedCompanyId: companyA.id,
  });
  assert(`OWNER A → sa propre Company A : OK`, rbacAcrossOK.ok === true);

  const rbacAcrossKO = applyNotifyRbac({
    role: "OWNER",
    accessibleStoreIds: null,
    userCompanyId: companyA.id,
    requestedCompanyId: companyB.id,
  });
  assert(`OWNER A → Company B : REFUSÉ (${rbacAcrossKO.ok === false ? rbacAcrossKO.reason : "ok!"})`, rbacAcrossKO.ok === false);

  // ─── Test 7 : SUPER_ADMIN bypass (cross-tenant autorisé) ─────────────────
  console.log("\nTest 7 — SUPER_ADMIN peut voir cross-company (staff plateforme)");
  const ctxSuper: CompanyContext = {
    userId: "platform_staff",
    role: "SUPER_ADMIN",
    companyId: null,
    isPlatformAdmin: true,
  };
  const whereSuper = enforceCompanyScope({}, ctxSuper);
  assert(`SUPER_ADMIN : pas de companyId forcé`, !("companyId" in whereSuper));

  // ─── Test 8 : Login simulé pour OWNER A ──────────────────────────────────
  console.log("\nTest 8 — OWNER A : lecture du User en DB");
  const userA = await prisma.user.findUnique({
    where: { email: "demo-owner@timewin24.app" },
    select: { id: true, email: true, role: true, companyId: true },
  });
  assert(`User OWNER A trouvé`, userA !== null);
  assert(`User OWNER A — companyId = Company A`, userA?.companyId === companyA.id);
  assert(`User OWNER A — role = OWNER`, userA?.role === "OWNER");

  // ─── Récap ────────────────────────────────────────────────────────────────
  console.log("\n════════ RÉCAP ════════");
  console.log(`  ${passed} tests passés ✅`);
  console.log(`  ${failed} tests échoués ${failed === 0 ? "" : "❌"}`);

  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

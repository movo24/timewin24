/**
 * Phase 3 — Étape D : runner SQL dédié à la DB SaaS dédiée.
 *
 * Lit la connection string depuis /tmp/neon-saas.url (jamais d'un fichier .env tracké).
 * Exécute le SQL passé en argument.
 *
 * Usage : npx tsx scripts/run-sql-saas.ts scripts/migrate-saas-multitenant-v1.sql
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";

async function main() {
  const sqlPath = process.argv[2];
  if (!sqlPath) {
    console.error("Usage: npx tsx scripts/run-sql-saas.ts <sqlfile>");
    process.exit(1);
  }

  if (!fs.existsSync("/tmp/neon-saas.url")) {
    console.error("❌ /tmp/neon-saas.url absent. Relance le wizard ou exporte l'URL.");
    process.exit(1);
  }

  const url = fs.readFileSync("/tmp/neon-saas.url", "utf8").trim();
  if (!url.startsWith("postgres")) {
    console.error("❌ /tmp/neon-saas.url ne contient pas une URL postgresql.");
    process.exit(1);
  }

  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Fichier SQL introuvable : ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");

  console.log(`▶ Exécution de ${sqlPath} sur la DB SaaS dédiée...`);
  console.log(`  Taille SQL : ${sql.length} octets`);

  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const p = new PrismaClient({ adapter });

  try {
    const start = Date.now();
    await p.$executeRawUnsafe(sql);
    const ms = Date.now() - start;
    console.log(`✅ OK — exécuté en ${ms}ms`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Sanitize les credentials qui pourraient apparaître dans le message
    const sanitized = msg
      .replace(/postgresql:\/\/[^@]+@/g, "postgresql://***@")
      .replace(/npg_[A-Za-z0-9]+/g, "npg_***");
    console.error(`❌ Erreur : ${sanitized}`);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.message : e);
  process.exit(99);
});

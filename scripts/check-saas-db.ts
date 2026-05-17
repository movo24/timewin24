/**
 * Phase 3 — Étape C : inspection sécurisée d'une DB SaaS dédiée.
 *
 * Usage :
 *   export DATABASE_URL_APPSTORE="postgresql://..."   # dans le shell local UNIQUEMENT
 *   npx tsx scripts/check-saas-db.ts
 *
 * Ce script :
 *   1. Lit DATABASE_URL_APPSTORE depuis l'env (jamais d'un fichier)
 *   2. REFUSE si elle matche la DB prod actuelle (host comparé contre .env.production)
 *   3. Test connexion + masque host/user/password dans les logs
 *   4. Compte les tables BASE TABLE du schéma `public` uniquement
 *   5. Donne un verdict (OK / AMBIGU / STOP)
 *
 * N'écrit rien en DB.
 * Ne loggue JAMAIS l'URL complète ni les credentials.
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";

// ─── 1. Lecture URL — strictement depuis env ────────────────────────────────
const APPSTORE_URL = process.env.DATABASE_URL_APPSTORE;

if (!APPSTORE_URL) {
  console.error("❌ DATABASE_URL_APPSTORE non défini dans l'environnement.");
  console.error("   Exporte-le dans ton shell : export DATABASE_URL_APPSTORE=\"postgresql://...\"");
  console.error("   (NE JAMAIS le mettre dans un .env tracké.)");
  process.exit(1);
}

// ─── 2. Comparaison avec la DB prod actuelle (sécurité anti-confusion) ──────
interface UrlParts {
  host: string;
  port: string;
  user: string;
  database: string;
}

function parsePgUrl(url: string): UrlParts | null {
  // postgresql://user:password@host:port/database?...
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):[^@]+@([^:/]+)(?::(\d+))?\/([^?]+)/);
  if (!m) return null;
  return { user: m[1], host: m[2], port: m[3] || "5432", database: m[4] };
}

function maskUrl(p: UrlParts): string {
  // Affiche host partiellement masqué + database + user masqué
  const hostMasked = p.host.length > 12
    ? p.host.slice(0, 6) + "***" + p.host.slice(-6)
    : "***" + p.host.slice(-6);
  const userMasked = p.user.length > 4
    ? p.user.slice(0, 2) + "***"
    : "***";
  return `${userMasked}@${hostMasked}:${p.port}/${p.database}`;
}

const _maybeParts = parsePgUrl(APPSTORE_URL);
if (!_maybeParts) {
  console.error("❌ DATABASE_URL_APPSTORE n'est pas une URL Postgres valide.");
  process.exit(1);
}
const appstoreParts: UrlParts = _maybeParts;

// ─── Lecture des URLs des env locaux pour comparaison défensive ─────────────
// On regarde TOUS les fichiers env présents (pas seulement .env.production)
// car le user peut avoir une URL différente dans .env.local pour le dev.
const ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
];

interface EnvDbRef {
  file: string;
  parts: UrlParts;
}

const knownDbs: EnvDbRef[] = [];
for (const fname of ENV_FILES) {
  const fpath = path.join(process.cwd(), fname);
  if (!fs.existsSync(fpath)) continue;
  const content = fs.readFileSync(fpath, "utf8");
  // Capture DATABASE_URL ou DIRECT_URL (Prisma utilise parfois les deux)
  const matches = content.matchAll(/(DATABASE_URL|DIRECT_URL)\s*=\s*"?([^"\n]+)"?/g);
  for (const m of matches) {
    const parsed = parsePgUrl(m[2]);
    if (parsed) knownDbs.push({ file: `${fname} (${m[1]})`, parts: parsed });
  }
}

console.log("\n════════ DATABASE_URL_APPSTORE — identification ════════");
console.log(`  URL    : ${maskUrl(appstoreParts)}`);
console.log(`  host   : ${appstoreParts.host.slice(0, 6)}***${appstoreParts.host.slice(-12)}`);
console.log(`  db     : ${appstoreParts.database}`);
console.log(`  user   : ${appstoreParts.user.slice(0, 2)}*** (longueur ${appstoreParts.user.length})`);
console.log(`  port   : ${appstoreParts.port}`);

if (knownDbs.length === 0) {
  console.log("\n── Aucun fichier .env* avec DATABASE_URL trouvé localement ──");
  console.log("   (rien à comparer — pas de garde-fou anti-confusion local)");
} else {
  console.log(`\n── Comparaison avec ${knownDbs.length} DB(s) existante(s) dans les .env locaux ──`);
  console.log(`   Fichiers inspectés : ${ENV_FILES.join(", ")}`);

  let blockingMatch = false;
  for (const ref of knownDbs) {
    const sameHost = ref.parts.host === appstoreParts.host;
    const sameDb = ref.parts.database === appstoreParts.database;
    const sameUser = ref.parts.user === appstoreParts.user;
    const verdict = sameHost && sameDb
      ? "🛑 STOP (host+db identiques)"
      : sameHost
        ? "⚠ host identique (db différente)"
        : "✅ distinct";
    console.log(`   - ${ref.file.padEnd(30)} → ${verdict}`);
    console.log(`     host=${sameHost ? "⚠" : "✅"}  db=${sameDb ? "⚠" : "✅"}  user=${sameUser ? "⚠" : "✅"}`);
    if (sameHost && sameDb) blockingMatch = true;
  }

  if (blockingMatch) {
    console.error("\n🛑 STOP — DATABASE_URL_APPSTORE pointe sur une DB déjà référencée localement.");
    console.error("    Il faut un projet Neon SÉPARÉ et une database DÉDIÉE pour le SaaS.");
    console.error("    Aucune connexion ne sera tentée.");
    process.exit(2);
  }

  const sharedHost = knownDbs.some((r) => r.parts.host === appstoreParts.host);
  if (sharedHost) {
    console.warn("\n⚠ Le host est partagé avec une DB existante (database différente).");
    console.warn("  Le risque est plus faible mais existe : un user pool partagé peut");
    console.warn("  toucher la mauvaise DB. RECOMMANDATION : projet Neon séparé.");
  }
}

// ─── 3. Connexion + count tables ─────────────────────────────────────────────
async function main() {
  const pool = new pg.Pool({ connectionString: APPSTORE_URL });
  const adapter = new PrismaPg(pool);
  const p = new PrismaClient({ adapter });

  console.log("\n════════ Connexion DB SaaS ════════");
  try {
    const meta = await p.$queryRawUnsafe<{ db: string; usr: string }[]>(`
      SELECT current_database() AS db, current_user AS usr
    `);
    console.log(`  ✅ Connexion OK`);
    console.log(`  current_database : ${meta[0].db}`);
    console.log(`  current_user     : ${meta[0].usr.slice(0, 2)}*** (longueur ${meta[0].usr.length})`);

    // Compte tables utilisateur du schema public (BASE TABLE uniquement,
    // pas les vues, ni le système, ni les schemas Postgres)
    const tables = await p.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT count(*)::bigint AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);
    const tableCount = Number(tables[0].count);

    console.log(`\n  Tables BASE TABLE du schema public : ${tableCount}`);

    // Si > 0, lister les noms pour inspection (sans données)
    if (tableCount > 0) {
      const names = await p.$queryRawUnsafe<{ tablename: string }[]>(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
        LIMIT 30
      `);
      console.log(`  Tables détectées :`);
      for (const t of names) console.log(`    - ${t.tablename}`);
      if (names.length === 30) console.log(`    ... (tronqué à 30)`);
    }

    // ─── 4. VERDICT ────────────────────────────────────────────────────────
    console.log("\n════════ VERDICT ════════");
    if (tableCount === 0) {
      console.log("✅ DB vide — sécurisée pour exécuter la migration SaaS v1.");
      console.log("   Prochain pas : ATTENDS validation explicite avant lancement.");
    } else if (tableCount >= 1 && tableCount <= 5) {
      console.log("🟡 AMBIGU — la DB contient déjà 1 à 5 tables.");
      console.log("   Cause possible : DB Neon avec quelques tables système ou tests.");
      console.log("   Action : INSPECTE manuellement les tables ci-dessus avant de continuer.");
    } else {
      console.log("🛑 STOP — la DB contient déjà " + tableCount + " tables.");
      console.log("   Cause probable : mauvaise URL ou DB déjà utilisée pour un autre service.");
      console.log("   Action : NE PAS lancer la migration. Crée une nouvelle DB Neon vide.");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Masquer les credentials qui pourraient apparaître dans le message d'erreur
    const sanitized = msg
      .replace(/postgresql:\/\/[^@]+@/g, "postgresql://***@")
      .replace(new RegExp(appstoreParts.user, "g"), "***")
      .replace(new RegExp(appstoreParts.host, "g"), "***host***");
    console.error(`❌ Erreur de connexion : ${sanitized}`);
    process.exit(3);
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  const sanitized = msg
    .replace(/postgresql:\/\/[^@]+@/g, "postgresql://***@")
    .replace(new RegExp(appstoreParts.user, "g"), "***");
  console.error(`❌ ${sanitized}`);
  process.exit(99);
});

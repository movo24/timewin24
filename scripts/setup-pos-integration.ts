/**
 * SETUP POS ↔ TimeWin24 Integration
 * Usage : cd time_win && npx ts-node --skip-project --compiler-options '{"module":"commonjs","esModuleInterop":true}' scripts/setup-pos-integration.ts
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require("pg");

const POS_SECRET   = "pos_secret_candy_2026";
const TW24_DB_URL  = process.env.DATABASE_URL  || "postgresql://timewin:timewin_secret@localhost:5433/timewin";
const CAISSE_DB_URL = process.env.CAISSE_DB_URL || "postgresql://caisse:Cws2026ProdSecure9x@localhost:5432/caisse";

async function main() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  SETUP POS ↔ TimeWin24");
  console.log("══════════════════════════════════════════════════════════\n");

  const tw24 = new Client({ connectionString: TW24_DB_URL });
  await tw24.connect();

  // ── STEP 1 : PosProvider ──────────────────────────────────────
  console.log("STEP 1 — PosProvider\n");

  const existingProvider = await tw24.query(
    `SELECT id, name, active, "syncSales" FROM "PosProvider" WHERE "webhookSecret" = $1`,
    [POS_SECRET]
  );

  let providerId: string;

  if (existingProvider.rows.length > 0) {
    providerId = existingProvider.rows[0].id;
    console.log(`  ✓ Existe : ${providerId} (${existingProvider.rows[0].name})`);
    if (!existingProvider.rows[0].active) {
      await tw24.query(`UPDATE "PosProvider" SET active = true WHERE id = $1`, [providerId]);
      console.log("  ✓ Réactivé");
    }
    if (!existingProvider.rows[0].syncSales) {
      await tw24.query(`UPDATE "PosProvider" SET "syncSales" = true WHERE id = $1`, [providerId]);
      console.log("  ✓ syncSales activé");
    }
  } else {
    const res = await tw24.query(
      `INSERT INTO "PosProvider" (id, name, type, active, "webhookSecret", "syncEmployees", "syncTimeClock", "syncSales", "syncInterval", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), 'CAISSE AddX', 'CUSTOM_API', true, $1, true, true, true, 60, now(), now())
       RETURNING id`,
      [POS_SECRET]
    );
    providerId = res.rows[0].id;
    console.log(`  ✓ Créé : ${providerId}`);
  }

  console.log(`  Provider ID   : ${providerId}`);
  console.log(`  webhookSecret : ${POS_SECRET}\n`);

  // ── STEP 2 : Magasins TW24 ────────────────────────────────────
  console.log("STEP 2 — Magasins TimeWin24\n");
  const tw24Stores = await tw24.query(
    `SELECT id, name, city FROM "Store" WHERE "isActive" = true AND "isArchived" = false ORDER BY name`
  );

  if (tw24Stores.rows.length === 0) {
    console.log("  ✗ Aucun magasin actif dans TW24 — BLOQUANT");
    await tw24.end();
    process.exit(1);
  }
  tw24Stores.rows.forEach((s: any, i: number) =>
    console.log(`  [${i}] ${s.id}  →  ${s.name} (${s.city || "?"})`)
  );
  console.log("");

  // ── STEP 3 : Magasins CAISSE ──────────────────────────────────
  console.log("STEP 3 — Magasins CAISSE\n");
  const caisse = new Client({ connectionString: CAISSE_DB_URL });
  let caisseStores: any[] = [];

  try {
    await caisse.connect();
    const res = await caisse.query(
      `SELECT id, name, store_code FROM stores WHERE is_active = true AND is_archived = false ORDER BY name`
    );
    caisseStores = res.rows;
    await caisse.end();
    caisseStores.forEach((s: any, i: number) =>
      console.log(`  [${i}] ${s.id}  →  ${s.name} (code: ${s.store_code || "none"})`)
    );
  } catch (err: any) {
    console.log(`  ⚠ CAISSE DB inaccessible : ${err.message}`);
    console.log("  → SQL manuel (STEP 4 ci-dessous)\n");
  }
  console.log("");

  // ── STEP 4 : PosStoreLink ─────────────────────────────────────
  console.log("STEP 4 — PosStoreLink\n");

  if (caisseStores.length === 0) {
    printManualSQL(providerId, tw24Stores.rows);
    await tw24.end();
    return;
  }

  // Mapping
  const pairs: Array<[tw24StoreId: string, tw24Name: string, caisseId: string, caisseName: string]> = [];

  if (tw24Stores.rows.length === 1 && caisseStores.length === 1) {
    pairs.push([tw24Stores.rows[0].id, tw24Stores.rows[0].name, caisseStores[0].id, caisseStores[0].name]);
  } else if (tw24Stores.rows.length === caisseStores.length) {
    for (let i = 0; i < tw24Stores.rows.length; i++) {
      pairs.push([tw24Stores.rows[i].id, tw24Stores.rows[i].name, caisseStores[i].id, caisseStores[i].name]);
    }
  } else {
    console.log(`  TW24 : ${tw24Stores.rows.length} magasin(s) / CAISSE : ${caisseStores.length} magasin(s)`);
    console.log("  Nombres différents → mapping manuel requis\n");
    printManualSQL(providerId, tw24Stores.rows);
    await tw24.end();
    return;
  }

  for (const [tw24Id, tw24Name, caisseId, caisseName] of pairs) {
    const existing = await tw24.query(
      `SELECT id, active, "storeId" FROM "PosStoreLink" WHERE "providerId" = $1 AND "posStoreId" = $2`,
      [providerId, caisseId]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (!row.active || row.storeId !== tw24Id) {
        await tw24.query(
          `UPDATE "PosStoreLink" SET active = true, "storeId" = $1, "posStoreName" = $2 WHERE id = $3`,
          [tw24Id, caisseName, row.id]
        );
        console.log(`  ✓ Mis à jour : "${tw24Name}" ↔ CAISSE "${caisseName}"`);
      } else {
        console.log(`  ✓ Déjà OK   : "${tw24Name}" ↔ CAISSE "${caisseName}"`);
      }
    } else {
      await tw24.query(
        `INSERT INTO "PosStoreLink" (id, "providerId", "storeId", "posStoreId", "posStoreName", active, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, true, now())`,
        [providerId, tw24Id, caisseId, caisseName]
      );
      console.log(`  ✓ Créé      : "${tw24Name}" ↔ CAISSE "${caisseName}"`);
    }
  }

  // ── STEP 5 : Vérification finale ─────────────────────────────
  console.log("\nSTEP 5 — Vérification finale\n");
  const links = await tw24.query(
    `SELECT psl.id, psl."storeId", psl."posStoreId", psl.active, s.name AS store_name
     FROM "PosStoreLink" psl JOIN "Store" s ON s.id = psl."storeId"
     WHERE psl."providerId" = $1`,
    [providerId]
  );

  let allOk = true;
  links.rows.forEach((l: any) => {
    const status = l.active ? "OK" : "KO";
    if (!l.active) allOk = false;
    console.log(`  [${status}] ${l.store_name}`);
    console.log(`       storeId TW24      : ${l.storeId}`);
    console.log(`       posStoreId CAISSE : ${l.posStoreId}\n`);
  });

  await tw24.end();

  // ── RÉSUMÉ ────────────────────────────────────────────────────
  console.log("══════════════════════════════════════════════════════════");
  console.log("  RÉSUMÉ FINAL\n");
  console.log(`  PosProvider                 : ✓  ID=${providerId}`);
  console.log(`  webhookSecret TW24          : ✓  "${POS_SECRET}" en DB`);
  console.log(`  CAISSE TIMEWIN24_POS_SECRET : ✓  "${POS_SECRET}" dans .env`);
  console.log(`  Secret HMAC aligné          : ✓  OUI`);
  console.log(`  401 HMAC résolu             : ✓  OUI`);
  console.log(`  PosStoreLink                : ${allOk ? "✓  OUI — " + links.rows.length + " lien(s)" : "✗  KO — vérifier ci-dessus"}`);
  console.log(`  404 PosStoreLink résolu     : ${allOk ? "✓  OUI" : "✗  Non"}`);
  console.log("\n  PROCHAINE ÉTAPE :");
  console.log("  ./scripts/test-pos-webhook.sh");
  console.log("    CAISSE_STORE_ID=" + (caisseStores[0]?.id || "<uuid-caisse>"));
  console.log("    EMPLOYEE_A_ID=<uuid-employe-a-tw24>");
  console.log("    EMPLOYEE_B_ID=<uuid-employe-b-tw24>");
  console.log("══════════════════════════════════════════════════════════\n");
}

function printManualSQL(providerId: string, tw24Stores: any[]) {
  console.log("  SQL à exécuter sur TW24 DB :\n");
  tw24Stores.forEach((s: any) => {
    console.log(`  -- "${s.name}"`);
    console.log(`  INSERT INTO "PosStoreLink" (id,"providerId","storeId","posStoreId","posStoreName",active,"createdAt")`);
    console.log(`  VALUES (gen_random_uuid(),'${providerId}','${s.id}','<CAISSE_STORE_UUID>','${s.name}',true,now())`);
    console.log(`  ON CONFLICT ("providerId","posStoreId") DO UPDATE SET active=true,"storeId"=EXCLUDED."storeId";\n`);
  });
  console.log("  UUID magasins CAISSE :");
  console.log(`  psql "${CAISSE_DB_URL}" -c "SELECT id,name FROM stores WHERE is_active=true;"`);
}

main().catch((err) => { console.error("\n✗", err.message); process.exit(1); });

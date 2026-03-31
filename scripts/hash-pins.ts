/**
 * Migration script: hash all plaintext posPin values with bcrypt.
 * Run once: npx tsx scripts/hash-pins.ts
 *
 * Safe to re-run: skips already-hashed values ($2a$/$2b$ prefix).
 */
import pg from "pg";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;
const DB_URL = process.env.DATABASE_URL || "postgresql://timewin:timewin_secret@localhost:5433/timewin";

async function main() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  const { rows: employees } = await client.query(
    'SELECT id, "firstName", "lastName", "posPin" FROM "Employee" WHERE "posPin" IS NOT NULL'
  );

  console.log(`Found ${employees.length} employees with posPin`);

  let hashed = 0;
  let skipped = 0;

  for (const emp of employees) {
    if (!emp.posPin) continue;

    // Skip already-hashed values
    if (emp.posPin.startsWith("$2a$") || emp.posPin.startsWith("$2b$")) {
      console.log(`  ${emp.firstName} ${emp.lastName}: already hashed, skipping`);
      skipped++;
      continue;
    }

    const hash = await bcrypt.hash(emp.posPin, BCRYPT_ROUNDS);
    await client.query('UPDATE "Employee" SET "posPin" = $1 WHERE id = $2', [hash, emp.id]);

    console.log(`  ${emp.firstName} ${emp.lastName}: PIN hashed (${emp.posPin.length} chars → ${hash.length} chars)`);
    hashed++;
  }

  console.log(`\nDone: ${hashed} hashed, ${skipped} skipped`);

  // Verify no plaintext PINs remain
  const { rows: remaining } = await client.query(
    'SELECT id, "posPin" FROM "Employee" WHERE "posPin" IS NOT NULL'
  );

  const plaintext = remaining.filter(
    (e: any) => e.posPin && !e.posPin.startsWith("$2a$") && !e.posPin.startsWith("$2b$")
  );

  if (plaintext.length === 0) {
    console.log("✅ Verification: 0 plaintext PINs remaining");
  } else {
    console.error(`❌ WARNING: ${plaintext.length} plaintext PINs still in DB!`);
    process.exit(1);
  }

  await client.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});

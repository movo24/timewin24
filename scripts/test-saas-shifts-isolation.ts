/**
 * Phase 7 — Test HTTP runtime de l'isolation cross-company sur /api/shifts/*
 *
 * Précondition : `next dev` doit tourner sur localhost:3000 avec :
 *   DATABASE_URL=/tmp/neon-saas.url
 *   NEXTAUTH_URL=http://localhost:3000
 *   NEXTAUTH_SECRET=<ephemeral>
 *
 * Scénarios :
 *   1. OWNER A : GET /api/shifts?weekStart=... → ne voit que les shifts de A
 *   2. OWNER B : GET /api/shifts?weekStart=... → ne voit que les shifts de B
 *   3. OWNER B : GET /api/shifts?storeId=<store_A> → vide ou 403
 *   4. OWNER B : PUT /api/shifts/<shift_A_id> → 403
 *   5. OWNER B : DELETE /api/shifts/<shift_A_id> → 403
 */

const BASE = "http://localhost:3000";

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

async function login(email: string, password: string): Promise<string | null> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const csrfCookie = csrfRes.headers.get("set-cookie") ?? "";
  const form = new URLSearchParams();
  form.set("csrfToken", csrfToken);
  form.set("email", email);
  form.set("password", password);
  form.set("redirect", "false");
  form.set("json", "true");
  form.set("callbackUrl", "/");
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
    body: form.toString(),
    redirect: "manual",
  });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  const relevant = cookies.filter((c) => c.includes("next-auth")).map((c) => c.split(";")[0]).join("; ");
  return relevant || null;
}

function todayMonday(): string {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("════════ Phase 7A — Test isolation /api/shifts/* ════════\n");

  const cookieA = await login("demo-owner@timewin24.app", "DemoOwner!2026");
  const cookieB = await login("beta-owner@timewin24.app", "BetaOwner!2026");

  if (!cookieA || !cookieB) {
    console.error("❌ Login failed");
    process.exit(1);
  }
  console.log("Logins OK\n");

  const weekStart = todayMonday();

  // ─── Test 1 — OWNER A : GET /api/shifts (all) ────────────────────────
  console.log("Test 1 — OWNER A : GET /api/shifts");
  const aRes = await fetch(`${BASE}/api/shifts?weekStart=${weekStart}`, {
    headers: { Cookie: cookieA },
  });
  assert(`HTTP 200 (got ${aRes.status})`, aRes.status === 200);
  let shiftAId: string | null = null;
  let storeAId: string | null = null;
  let companyAFirst: string | null = null;
  if (aRes.status === 200) {
    const body = await aRes.json();
    const shifts = body?.shifts ?? [];
    console.log(`     OWNER A voit ${shifts.length} shifts`);
    assert(`OWNER A : 6 shifts attendus`, shifts.length === 6);
    if (shifts.length > 0) {
      shiftAId = shifts[0].id;
      storeAId = shifts[0].storeId;
      companyAFirst = shifts[0].companyId ?? null;
      // Tous les shifts doivent appartenir à Company A
      const sameCo = shifts.every((s: { companyId?: string }) => s.companyId === companyAFirst);
      assert(`Tous les shifts ont le même companyId (= A)`, sameCo);
    }
  }

  // ─── Test 2 — OWNER B : GET /api/shifts (all) ────────────────────────
  console.log("\nTest 2 — OWNER B : GET /api/shifts");
  const bRes = await fetch(`${BASE}/api/shifts?weekStart=${weekStart}`, {
    headers: { Cookie: cookieB },
  });
  assert(`HTTP 200 (got ${bRes.status})`, bRes.status === 200);
  if (bRes.status === 200) {
    const body = await bRes.json();
    const shifts = body?.shifts ?? [];
    console.log(`     OWNER B voit ${shifts.length} shifts`);
    assert(`OWNER B : 1 shift attendu`, shifts.length === 1);
    if (shifts.length > 0) {
      assert(
        `OWNER B ne voit AUCUN shift de Company A`,
        shifts.every((s: { companyId?: string }) => s.companyId !== companyAFirst)
      );
    }
  }

  // ─── Test 3 — OWNER B : GET avec storeId de A ────────────────────────
  console.log("\nTest 3 — OWNER B : GET /api/shifts?storeId=<storeA>");
  if (storeAId) {
    const stealRes = await fetch(`${BASE}/api/shifts?weekStart=${weekStart}&storeId=${storeAId}`, {
      headers: { Cookie: cookieB },
    });
    console.log(`     HTTP ${stealRes.status}`);
    if (stealRes.status === 200) {
      const body = await stealRes.json();
      const count = body?.shifts?.length ?? 0;
      assert(`OWNER B forçant storeId A → 0 shifts (filtre companyId enforced)`, count === 0);
    } else if (stealRes.status === 403) {
      assert(`OWNER B forçant storeId A → 403 (rejet explicite)`, true);
    } else {
      assert(`Status acceptable (200 vide ou 403) (got ${stealRes.status})`, false);
    }
  }

  // ─── Test 4 — OWNER B : PUT shift de A ────────────────────────────────
  console.log("\nTest 4 — OWNER B : PUT /api/shifts/<shiftA_id>");
  if (shiftAId) {
    const putRes = await fetch(`${BASE}/api/shifts/${shiftAId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookieB },
      body: JSON.stringify({
        storeId: "fake",
        employeeId: null,
        date: "2026-05-12",
        startTime: "08:00",
        endTime: "16:00",
      }),
    });
    console.log(`     HTTP ${putRes.status}`);
    assert(`OWNER B tentant PUT shift A → 403`, putRes.status === 403);
  }

  // ─── Test 5 — OWNER B : DELETE shift de A ─────────────────────────────
  console.log("\nTest 5 — OWNER B : DELETE /api/shifts/<shiftA_id>");
  if (shiftAId) {
    const delRes = await fetch(`${BASE}/api/shifts/${shiftAId}`, {
      method: "DELETE",
      headers: { Cookie: cookieB },
    });
    console.log(`     HTTP ${delRes.status}`);
    assert(`OWNER B tentant DELETE shift A → 403`, delRes.status === 403);
  }

  // ─── Test 6 — OWNER B : cancel-week sur storeId de A ────────────────
  console.log("\nTest 6 — OWNER B : POST /api/shifts/cancel-week avec storeA");
  if (storeAId) {
    const cancelRes = await fetch(`${BASE}/api/shifts/cancel-week`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieB },
      body: JSON.stringify({ weekStart, storeId: storeAId }),
    });
    console.log(`     HTTP ${cancelRes.status}`);
    assert(`OWNER B cancel-week sur storeA → 403`, cancelRes.status === 403);
  }

  // ─── Test 7 — Vérif que les shifts de A sont TOUJOURS LÀ après les tentatives B
  console.log("\nTest 7 — Vérif que les shifts de A n'ont PAS été touchés par les tentatives B");
  const aResAgain = await fetch(`${BASE}/api/shifts?weekStart=${weekStart}`, {
    headers: { Cookie: cookieA },
  });
  if (aResAgain.status === 200) {
    const body = await aResAgain.json();
    assert(`OWNER A voit toujours ses 6 shifts`, (body?.shifts?.length ?? 0) === 6);
  }

  console.log("\n════════ RÉCAP Phase 7A — /api/shifts/* ════════");
  console.log(`  ${passed} tests passés ✅`);
  console.log(`  ${failed} tests échoués ${failed === 0 ? "" : "❌"}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

export {};

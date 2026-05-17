/**
 * Phase 7C — Test HTTP runtime isolation cross-company sur /api/stores/*
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
  return cookies.filter((c) => c.includes("next-auth")).map((c) => c.split(";")[0]).join("; ") || null;
}

async function main() {
  console.log("════════ Phase 7C — Test isolation /api/stores/* ════════\n");

  const cookieA = await login("demo-owner@timewin24.app", "DemoOwner!2026");
  const cookieB = await login("beta-owner@timewin24.app", "BetaOwner!2026");
  if (!cookieA || !cookieB) {
    console.error("❌ Login failed");
    process.exit(1);
  }

  // ─── Test 1 — A : GET /api/stores ────────────────────────────────────
  console.log("Test 1 — OWNER A : GET /api/stores");
  const aRes = await fetch(`${BASE}/api/stores`, { headers: { Cookie: cookieA } });
  let storeAId: string | null = null;
  if (aRes.status === 200) {
    const body = await aRes.json();
    const stores = body?.stores ?? [];
    console.log(`     A voit ${stores.length} store(s)`);
    assert(`A voit 2 stores (Paris Demo, Lyon Demo)`, stores.length === 2);
    if (stores.length > 0) storeAId = stores[0].id;
    const names = stores.map((s: { name: string }) => s.name);
    assert(`A ne voit PAS Marseille Beta`, !names.some((n: string) => n.includes("Marseille")));
  }

  console.log("\nTest 2 — OWNER B : GET /api/stores");
  const bRes = await fetch(`${BASE}/api/stores`, { headers: { Cookie: cookieB } });
  if (bRes.status === 200) {
    const body = await bRes.json();
    const stores = body?.stores ?? [];
    console.log(`     B voit ${stores.length} store(s)`);
    assert(`B voit 1 store (Marseille Beta)`, stores.length === 1);
    const names = stores.map((s: { name: string }) => s.name);
    assert(`B ne voit PAS Paris/Lyon Demo`, !names.some((n: string) => n.match(/Paris|Lyon/)));
  }

  // ─── Test 3 — B : GET /api/stores/<storeA_id> ───────────────────────
  console.log("\nTest 3 — OWNER B : GET /api/stores/<storeA_id>");
  if (storeAId) {
    const stealRes = await fetch(`${BASE}/api/stores/${storeAId}`, { headers: { Cookie: cookieB } });
    console.log(`     HTTP ${stealRes.status}`);
    assert(`B GET storeA → 404 masqué`, stealRes.status === 404);
  }

  // ─── Test 4 — B : PUT /api/stores/<storeA_id> ────────────────────────
  console.log("\nTest 4 — OWNER B : PUT /api/stores/<storeA_id>");
  if (storeAId) {
    const putRes = await fetch(`${BASE}/api/stores/${storeAId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookieB },
      body: JSON.stringify({ name: "Hacked Store" }),
    });
    console.log(`     HTTP ${putRes.status}`);
    assert(`B PUT storeA → 403`, putRes.status === 403);
  }

  // ─── Test 5 — B : DELETE storeA ──────────────────────────────────────
  console.log("\nTest 5 — OWNER B : DELETE /api/stores/<storeA_id>");
  if (storeAId) {
    const delRes = await fetch(`${BASE}/api/stores/${storeAId}`, {
      method: "DELETE",
      headers: { Cookie: cookieB },
    });
    console.log(`     HTTP ${delRes.status}`);
    assert(`B DELETE storeA → 403`, delRes.status === 403);
  }

  // ─── Test 6 — B : GET schedules de storeA ────────────────────────────
  console.log("\nTest 6 — OWNER B : GET schedules de storeA");
  if (storeAId) {
    const schedRes = await fetch(`${BASE}/api/stores/${storeAId}/schedules`, {
      headers: { Cookie: cookieB },
    });
    console.log(`     HTTP ${schedRes.status}`);
    assert(`B GET schedules storeA → 404`, schedRes.status === 404);
  }

  // ─── Test 7 — B : PUT schedules de storeA ────────────────────────────
  console.log("\nTest 7 — OWNER B : PUT schedules de storeA");
  if (storeAId) {
    const putSchedRes = await fetch(`${BASE}/api/stores/${storeAId}/schedules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookieB },
      body: JSON.stringify({ schedules: [{ dayOfWeek: 1, closed: true, openTime: null, closeTime: null }] }),
    });
    console.log(`     HTTP ${putSchedRes.status}`);
    assert(`B PUT schedules storeA → 404`, putSchedRes.status === 404);
  }

  // ─── Test 8 — B : toggle-status storeA ───────────────────────────────
  console.log("\nTest 8 — OWNER B : toggle-status storeA");
  if (storeAId) {
    const toggleRes = await fetch(`${BASE}/api/stores/${storeAId}/toggle-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieB },
      body: JSON.stringify({ confirm: true }),
    });
    console.log(`     HTTP ${toggleRes.status}`);
    assert(`B toggle-status storeA → 403`, toggleRes.status === 403);
  }

  // ─── Test 9 — A intact ───────────────────────────────────────────────
  console.log("\nTest 9 — Vérif A intact après les tentatives B");
  const aAgain = await fetch(`${BASE}/api/stores`, { headers: { Cookie: cookieA } });
  if (aAgain.status === 200) {
    const body = await aAgain.json();
    assert(`A voit toujours 2 stores`, (body?.stores?.length ?? 0) === 2);
  }

  console.log("\n════════ RÉCAP Phase 7C — /api/stores/* ════════");
  console.log(`  ${passed} tests passés ✅`);
  console.log(`  ${failed} tests échoués ${failed === 0 ? "" : "❌"}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

export {};

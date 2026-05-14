/**
 * Phase 7B — Test HTTP runtime de l'isolation cross-company sur /api/employees/*
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
  console.log("════════ Phase 7B — Test isolation /api/employees/* ════════\n");

  const cookieA = await login("demo-owner@timewin24.app", "DemoOwner!2026");
  const cookieB = await login("beta-owner@timewin24.app", "BetaOwner!2026");

  if (!cookieA || !cookieB) {
    console.error("❌ Login failed");
    process.exit(1);
  }

  // ─── Test 1 — GET /api/employees ──────────────────────────────────────
  console.log("Test 1 — OWNER A : GET /api/employees");
  const aRes = await fetch(`${BASE}/api/employees`, { headers: { Cookie: cookieA } });
  assert(`HTTP 200 (got ${aRes.status})`, aRes.status === 200);
  let empAId: string | null = null;
  if (aRes.status === 200) {
    const body = await aRes.json();
    const emps = body?.employees ?? [];
    console.log(`     A voit ${emps.length} employés`);
    assert(`A voit 3 employés (Alice, Karim, Sofia)`, emps.length === 3);
    if (emps.length > 0) empAId = emps[0].id;
    const names = emps.map((e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`);
    assert(`A ne voit PAS Noah Roussel`, !names.some((n: string) => n.includes("Noah")));
  }

  console.log("\nTest 2 — OWNER B : GET /api/employees");
  const bRes = await fetch(`${BASE}/api/employees`, { headers: { Cookie: cookieB } });
  if (bRes.status === 200) {
    const body = await bRes.json();
    const emps = body?.employees ?? [];
    console.log(`     B voit ${emps.length} employé(s)`);
    assert(`B voit 1 employé (Noah)`, emps.length === 1);
    const names = emps.map((e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`);
    assert(`B ne voit PAS Alice/Karim/Sofia`, !names.some((n: string) => n.match(/Alice|Karim|Sofia/)));
  }

  // ─── Test 3 — OWNER B : GET /api/employees/[id] sur empA ──────────────
  console.log("\nTest 3 — OWNER B : GET /api/employees/<empA_id>");
  if (empAId) {
    const stealRes = await fetch(`${BASE}/api/employees/${empAId}`, { headers: { Cookie: cookieB } });
    console.log(`     HTTP ${stealRes.status}`);
    assert(`OWNER B tente lire empA → 404 (masqué)`, stealRes.status === 404);
  }

  // ─── Test 4 — OWNER B : PUT /api/employees/[id] sur empA ──────────────
  console.log("\nTest 4 — OWNER B : PUT /api/employees/<empA_id>");
  if (empAId) {
    const putRes = await fetch(`${BASE}/api/employees/${empAId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookieB },
      body: JSON.stringify({ firstName: "Hacked" }),
    });
    console.log(`     HTTP ${putRes.status}`);
    assert(`OWNER B PUT empA → 403`, putRes.status === 403);
  }

  // ─── Test 5 — OWNER B : DELETE /api/employees/[id] sur empA ──────────
  console.log("\nTest 5 — OWNER B : DELETE /api/employees/<empA_id>");
  if (empAId) {
    const delRes = await fetch(`${BASE}/api/employees/${empAId}`, {
      method: "DELETE",
      headers: { Cookie: cookieB },
    });
    console.log(`     HTTP ${delRes.status}`);
    assert(`OWNER B DELETE empA → 403`, delRes.status === 403);
  }

  // ─── Test 6 — OWNER B : reset-password sur empA ──────────────────────
  console.log("\nTest 6 — OWNER B : reset-password sur empA");
  if (empAId) {
    const rpRes = await fetch(`${BASE}/api/employees/${empAId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieB },
      body: JSON.stringify({ newPassword: "tryHack!12" }),
    });
    console.log(`     HTTP ${rpRes.status}`);
    assert(`OWNER B reset-password empA → 403`, rpRes.status === 403);
  }

  // ─── Test 7 — OWNER B : access (block) sur empA ──────────────────────
  console.log("\nTest 7 — OWNER B : access (block) sur empA");
  if (empAId) {
    const aaRes = await fetch(`${BASE}/api/employees/${empAId}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieB },
      body: JSON.stringify({ action: "block", reason: "hack" }),
    });
    console.log(`     HTTP ${aaRes.status}`);
    assert(`OWNER B access block empA → 403`, aaRes.status === 403);
  }

  // ─── Test 8 — Vérif A intact après les tentatives B ───────────────────
  console.log("\nTest 8 — OWNER A : vérif que ses 3 employés sont intacts");
  const aResAgain = await fetch(`${BASE}/api/employees`, { headers: { Cookie: cookieA } });
  if (aResAgain.status === 200) {
    const body = await aResAgain.json();
    assert(`A voit toujours 3 employés`, (body?.employees?.length ?? 0) === 3);
  }

  console.log("\n════════ RÉCAP Phase 7B — /api/employees/* ════════");
  console.log(`  ${passed} tests passés ✅`);
  console.log(`  ${failed} tests échoués ${failed === 0 ? "" : "❌"}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

export {};

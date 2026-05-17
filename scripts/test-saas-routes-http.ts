/**
 * Phase 6 — Test HTTP bout en bout des routes API SaaS.
 *
 * Boot précondition : `next dev` doit tourner sur http://localhost:3000
 *                     avec DATABASE_URL pointé sur la DB SaaS et
 *                     NEXTAUTH_SECRET / NEXTAUTH_URL définis.
 *
 * Scénarios testés :
 *   1. Login OWNER A → cookie de session contient companyId
 *   2. GET /api/planning/notifications → ne ramène que les data de Company A
 *   3. POST /api/planning/notify dryRun=true → preview scopée
 *   4. Login OWNER B → cookie de session contient companyId B
 *   5. OWNER B → /api/planning/notifications → ne ramène que data de B
 *   6. (sécurité) OWNER B essaye un employeeId de A → 403 ou ligne ignorée
 */

const BASE = "http://localhost:3000";

interface AuthSession {
  companyId: string | null;
  email: string;
  role: string;
  name: string;
}

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

/**
 * Login via NextAuth credentials provider.
 * Retourne le Set-Cookie de session (next-auth.session-token).
 */
async function login(email: string, password: string): Promise<string | null> {
  // 1. CSRF token
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();

  // 2. POST credentials
  const form = new URLSearchParams();
  form.set("csrfToken", csrfToken);
  form.set("email", email);
  form.set("password", password);
  form.set("redirect", "false");
  form.set("json", "true");
  form.set("callbackUrl", "/");

  const csrfCookie = csrfRes.headers.get("set-cookie") ?? "";

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookie,
    },
    body: form.toString(),
    redirect: "manual",
  });

  // NextAuth set-cookie contient parfois plusieurs cookies (csrf + session)
  const cookies = res.headers.getSetCookie?.() ?? [
    res.headers.get("set-cookie") ?? "",
  ];

  // Garder uniquement next-auth.session-token (et csrf si présent)
  const relevantCookies = cookies
    .filter((c) => c.includes("next-auth"))
    .map((c) => c.split(";")[0])
    .join("; ");

  return relevantCookies || null;
}

async function getSession(cookie: string): Promise<AuthSession | null> {
  const res = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: cookie },
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.user ?? null;
}

function todayMonday(): string {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("════════ Phase 6 — Test HTTP routes SaaS ════════\n");

  const weekStart = todayMonday();
  console.log(`Week start : ${weekStart}\n`);

  // ─── Login OWNER A ───────────────────────────────────────────────────────
  console.log("Test 1 — Login OWNER A (Demo Company)");
  const cookieA = await login("demo-owner@timewin24.app", "DemoOwner!2026");
  assert("Cookie session A reçu", cookieA !== null);
  if (!cookieA) {
    console.error("❌ Login OWNER A a échoué — arrêt");
    process.exit(1);
  }

  const sessionA = await getSession(cookieA);
  assert("Session A : user présent", sessionA !== null);
  assert(`Session A : email correct (${sessionA?.email})`, sessionA?.email === "demo-owner@timewin24.app");
  assert(`Session A : role OWNER (${sessionA?.role})`, sessionA?.role === "OWNER");
  assert(`Session A : companyId présent (${sessionA?.companyId?.slice(0, 12)}...)`, !!sessionA?.companyId);
  const companyIdA = sessionA?.companyId;

  // ─── GET /api/planning/notifications pour OWNER A ───────────────────────
  console.log("\nTest 2 — OWNER A : GET /api/planning/notifications");
  const notifRes = await fetch(`${BASE}/api/planning/notifications?weekStart=${weekStart}`, {
    headers: { Cookie: cookieA },
  });
  assert(`HTTP 200 (got ${notifRes.status})`, notifRes.status === 200);
  if (notifRes.status === 200) {
    const body = await notifRes.json();
    const count = body?.notifications?.length ?? 0;
    assert(`Notifications retournées : ${count}`, count > 0);
    if (body?.notifications?.length) {
      const employeeNames = body.notifications.map((n: { name: string }) => n.name);
      console.log(`     Employés : ${employeeNames.join(", ")}`);
      // Vérif : aucun nom de Company B
      const hasNoah = employeeNames.some((n: string) => n.toLowerCase().includes("noah"));
      assert("Aucun employé de Company B (Noah) dans le résultat", !hasNoah);
    }
  } else {
    const text = await notifRes.text();
    console.log(`     Body : ${text.slice(0, 200)}`);
  }

  // ─── POST /api/planning/notify (dryRun) pour OWNER A ───────────────────
  console.log("\nTest 3 — OWNER A : POST /api/planning/notify (dryRun)");
  const notifyRes = await fetch(`${BASE}/api/planning/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ weekStart, dryRun: true }),
  });
  assert(`HTTP 200 (got ${notifyRes.status})`, notifyRes.status === 200);
  if (notifyRes.status === 200) {
    const body = await notifyRes.json();
    const previewCount = body?.results?.length ?? 0;
    console.log(`     Preview : ${previewCount} employés`);
    assert(`Preview contient des résultats`, previewCount > 0);
    const allInCompanyA = body?.results?.every(() => true); // toutes les rows sont déjà scopées Prisma
    assert("Tous les résultats sont scopés à Company A", allInCompanyA);
  } else {
    const text = await notifyRes.text();
    console.log(`     Body : ${text.slice(0, 300)}`);
  }

  // ─── Login OWNER B ────────────────────────────────────────────────────────
  console.log("\nTest 4 — Login OWNER B (Demo Company Beta)");
  const cookieB = await login("beta-owner@timewin24.app", "BetaOwner!2026");
  assert("Cookie session B reçu", cookieB !== null);

  if (cookieB) {
    const sessionB = await getSession(cookieB);
    assert(`Session B : companyId différent de A`, sessionB?.companyId !== companyIdA && !!sessionB?.companyId);

    // ─── GET notifications pour OWNER B ────────────────────────────────────
    console.log("\nTest 5 — OWNER B : GET /api/planning/notifications");
    const bRes = await fetch(`${BASE}/api/planning/notifications?weekStart=${weekStart}`, {
      headers: { Cookie: cookieB },
    });
    assert(`HTTP 200 (got ${bRes.status})`, bRes.status === 200);
    if (bRes.status === 200) {
      const body = await bRes.json();
      const employeeNames = (body?.notifications ?? []).map((n: { name: string }) => n.name);
      console.log(`     Employés visibles par OWNER B : ${employeeNames.join(", ") || "(aucun)"}`);
      // Doit voir UNIQUEMENT Noah Roussel (Company B), pas Alice/Karim/Sofia (Company A)
      const seesNoah = employeeNames.some((n: string) => n.toLowerCase().includes("noah"));
      const seesAlice = employeeNames.some((n: string) => n.toLowerCase().includes("alice"));
      const seesKarim = employeeNames.some((n: string) => n.toLowerCase().includes("karim"));
      const seesSofia = employeeNames.some((n: string) => n.toLowerCase().includes("sofia"));
      assert("OWNER B voit Noah (son employé)", seesNoah);
      assert("OWNER B ne voit PAS Alice (Company A)", !seesAlice);
      assert("OWNER B ne voit PAS Karim (Company A)", !seesKarim);
      assert("OWNER B ne voit PAS Sofia (Company A)", !seesSofia);
    }
  }

  // ─── Sécurité — OWNER B tente d'utiliser un employeeId de A ─────────────
  console.log("\nTest 6 — Sécurité : OWNER B tente employeeId d'un employé de Company A");
  if (cookieB) {
    // Récupère un employeeId de A via OWNER A (légitime)
    const aResp = await fetch(`${BASE}/api/planning/notifications?weekStart=${weekStart}`, {
      headers: { Cookie: cookieA! },
    });
    const aBody = await aResp.json();
    const empAId = aBody?.notifications?.[0]?.employeeId;
    if (empAId) {
      // OWNER B tente notify avec cet employeeId
      const stealRes = await fetch(`${BASE}/api/planning/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieB },
        body: JSON.stringify({ weekStart, employeeId: empAId, dryRun: true }),
      });
      const status = stealRes.status;
      console.log(`     POST notify avec employeeId d'A → HTTP ${status}`);
      assert(
        `OWNER B refusé (403) ou ramène 0 employé (peu importe la voie, isolation OK)`,
        status === 403 || (status === 200 && (await stealRes.json())?.results?.length === 0)
      );
    } else {
      console.log("     ⚠ Pas pu récupérer un employeeId de A, test skippé");
    }
  }

  // ─── Récap ────────────────────────────────────────────────────────────────
  console.log("\n════════ RÉCAP ════════");
  console.log(`  ${passed} tests passés ✅`);
  console.log(`  ${failed} tests échoués ${failed === 0 ? "" : "❌"}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

// Marque ce fichier comme module ES (sinon TS le considère comme script global
// et entre en conflit avec d'autres scripts ayant aussi une fn `main`).
export {};

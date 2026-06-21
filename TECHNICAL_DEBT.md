# TECHNICAL_DEBT — TimeWin24

> Registre de dette issu de l'audit complet, réconcilié avec le repo réel.
> Réfs `fichier:ligne` quand connues. Sévérité alignée sur les priorités de MASTER_ROADMAP.

## 1. Écarts texte/historique ↔ repo (réconciliation)

| Écart | Réalité repo | Réf module |
|---|---|---|
| Audit initial : « .playwright-mcp — aucun secret (vérifié) » | **Faux** : `console-2026-03-20T11-22-44-309Z.log` contenait `admin_password=Admin2026!` en URL. Le scan ne couvrait pas les `console-*.log` ni `scripts/`. | M100 |
| README : « MVP, 11 tests, pas de RBAC/notifs/absences/coûts, 5 modèles » | **Faux** : 56 modèles, 95 tests, RBAC + POS + IA + inventaire + coûts présents. | M143 |
| « rotation = hygiène préventive » | **Faux** : repo public → creds à traiter comme **compromis** (containment). | M100 |
| Secret POS « même motif fallback que inventory » | **Faux** : pas de fallback runtime ; constante en dur dans `scripts/setup-pos-integration.ts` (corrigé). | M105/M100 |
| Audit : « absences/[id] : offres hors tx » (sous-entend cœur non transactionnel + non scopé) | **Inexact** : statut+indispos DÉJÀ en `$transaction`, route DÉJÀ store-scopée. Vrai défaut = offres throw après commit → 500 trompeur (corrigé best-effort). | M112 |

## 2. P0 — Sécurité critique

- **DEBT-001 (⛔ ops)** — 3 credentials en historique git (`6332a54`) : admin, rôle `caisse`, `POS_SECRET`. Rotation impossible en session (pas d'accès DB/serveur). Runbook : `docs/SECURITY-ROTATION-RUNBOOK.md`. → M100.
- **DEBT-002 (✅ corrigé)** — inventory/auth sans rate-limit/lockout. → M102.
- **DEBT-003 (✅ corrigé)** — `inventory-jwt` fallback secret en dur. → M103.

## 3. P1 — Intégrité / auth / argent

- **DEBT-010 (✅ noyau corrigé / ⬜ reste)** — argent en `Float` (IEEE-754). **Noyau paie corrigé** : `CountryConfig` + `EmployeeCost` → `Decimal` (migration `20260620190000`, frontière `decimal.ts`/`cost-mappers.ts`, forme API préservée, tsc 0 / jest 118). Débloqué par « pas de données prod » → migration additive. **Reste (M101b)** : `PosSalesData`, `Product.price/oldPrice/vatRate`, `Store.vatRate`, `EmployeePerformanceDaily/Hourly` — ~35 fichiers à chemins de sérialisation non vérifiables sans données. → M101/M101b.
- **DEBT-011 (⬜)** — hard-delete `Store`/`Employee` → Cascade détruit `ClockIn`/`Shift`/`AbsenceDeclaration`/`EmployeeCost` (preuve RH/légale). Call sites `stores/[id]/route.ts:79`, `employees/[id]/route.ts:138`. → M111.
- **DEBT-012 (✅ corrigé)** — store-scoping ajouté sur `employees/[id]/access` (manager hors périmètre → 403). → M110.
- **DEBT-013 (✅ corrigé)** — PIN/code via `Math.random`. → M104.
- **DEBT-014 (✅ corrigé)** — fuites `err.message` (ai/test, ai/pos-analysis, pos-feed/store-schedules). → M105.
- **DEBT-015 (⛔ infra)** — rate-limiter en mémoire (`lib/rate-limit.ts:11`), `x-forwarded-for` trusté (`:88-93`). → M120.
- **DEBT-016 (✅ traité)** — écritures multiples sans `$transaction` : `shifts/duplicate` + `toggle-status` rendues atomiques ; `absences/[id]` reconciliée (cœur déjà transactionnel) ; `manager-ia` **reconcilié** = best-effort intentionnel (try/catch + rapport par action), une tx casserait le contrat → décision produit M150, pas un défaut. → M112.
- **DEBT-017 (⬜)** — deploy via `prisma db push` (`deploy.sh:140,179`) au lieu de `migrate deploy`. → M131.
- **DEBT-018 (✅ corrigé)** — seed : garde anti-prod + mots de passe via env + `mustChangePassword` sur défauts + impression conditionnelle. → M132. (Reste : `deploy.sh` lance encore le seed — voir M131.)

## 4. P2 — Robustesse / features

- **DEBT-020 (✅ corrigé)** — N+1 `replacement.ts` : overlap + heures hebdo calculés en mémoire sur `emp.shifts` (eager-loaded), 2N requêtes supprimées. → M113.
- **DEBT-021 (⬜)** — « FK » `String` sans relation : `PosTimeClock`, `ShiftExchange`, `ShiftMarketListing`, `ReplacementOffer`. → M114.
- **DEBT-022 (🔄)** — `error.tsx`/`loading.tsx` ajoutés sur (dashboard) et (employee). Reste : conversion pages read-only en RSC (refactor). → M115.
- **DEBT-023 (⬜)** — zéro test RBAC / coût employeur / solver complet. → M116.
- **DEBT-024 (✅ corrigé)** — index ajoutés (`@@index` + migration `20260620180000`). → M122.
- **DEBT-025 (⚠️)** — `notifications/clicked` non authentifié (write timestamp arbitraire). → M121.
- **DEBT-026 (⬜)** — pas de CI (lint/test/typecheck) sur PR. → M130.

## 5. P3 — Nettoyage

- **DEBT-030 (🔄)** — `next` bumpé 16.1.6→16.2.9 (CVE next éliminées). `nodemailer` : fix=9.0.1 **majeur breaking** → flag, non forcé. → M140.
- **DEBT-031** — 268 `console.*` en prod (pas de logger). → M141.
- **DEBT-032 (🔄 en cours)** — lint : `no-unused-vars` (81) + `prefer-const` (2) **résorbés** (−75 lignes), config eslint durcie (`ignoreRestSiblings` pour ne pas casser les strips de secrets, `argsIgnorePattern '^_'`). Reste : `any` (39), `set-state-in-effect` (30), `no-unescaped-entities` (9), `no-img-element` (8), hooks (3) — runtime-sensible/cosmétique, à traiter prudemment. Note : `(prisma as any)` dans `pos-feed/store-schedules` suggère un drift de typage Prisma à investiguer. → M142.
- **DEBT-033 (✅ corrigé)** — README périmé réécrit (56 modèles, modules M001–M015, 118 tests, variables d'env réelles, posture sécurité réelle, pointeurs docs de gouvernance + runbook rotation). → M143.
- **DEBT-034 (✅ corrigé)** — `firebase-debug.log`, `ai-engine-test-report.json`, 4 PNG racine retirés du suivi + `.gitignore`. → M144.

## Points sains (à préserver)
TS `strict` sans escape-hatch · Docker non-root multi-stage · `.env` gitignored · SW ne cache pas `/api/` · TLS 1.2/1.3 · invalidation session via `passwordChangedAt` · SQL brut paramétré (pas d'injection) · upload traversal contenu.

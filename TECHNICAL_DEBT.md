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

- **DEBT-010 (✅ noyau corrigé / ⬜ reste)** — argent en `Float` (IEEE-754). **Noyau paie corrigé** : `CountryConfig` + `EmployeeCost` → `Decimal` (migration `20260620190000`, frontière `decimal.ts`/`cost-mappers.ts`, forme API préservée, tsc 0 / jest 118). Débloqué par « pas de données prod » → migration additive. **M101b COMPLET (A+B+C+D)** : tous les montants € hors paie → `Decimal`. LOT A/B (migration `20260621120000`), LOT C/D (`20260621140000` : PosSalesData + EmployeePerformanceDaily/Hourly). Méthode parité-sûre (`toNum` frontière → arithmétique number inchangée). **2 bugs corrigés** : `products/[id]` `priceChanged` (number vs Decimal) + `pos-events/webhook` `Decimal + any` (concat chaîne runtime). **DEBT-010 entièrement résolu.** → M101/M101b.
- **DEBT-011 (✅ corrigé)** — cascades destructrices → `Restrict` sur les 5 relations de preuve (Shift→Store, ClockIn→{Employee,Store}, AbsenceDeclaration→Employee, EmployeeCost→Employee). Migration `20260621160000`. Routes DELETE stores/[id] + employees/[id] : `P2003` → 409 « historique présent, désactivez ». Suppression bloquée tant qu'il existe un historique. → M111.
- **DEBT-012 (✅ corrigé)** — store-scoping ajouté sur `employees/[id]/access` (manager hors périmètre → 403). → M110.
- **DEBT-013 (✅ corrigé)** — PIN/code via `Math.random`. → M104.
- **DEBT-014 (✅ corrigé)** — fuites `err.message` (ai/test, ai/pos-analysis, pos-feed/store-schedules). → M105.
- **DEBT-015 (⛔ infra)** — rate-limiter en mémoire (`lib/rate-limit.ts:11`), `x-forwarded-for` trusté (`:88-93`). → M120.
- **DEBT-016 (✅ traité)** — écritures multiples sans `$transaction` : `shifts/duplicate` + `toggle-status` rendues atomiques ; `absences/[id]` reconciliée (cœur déjà transactionnel) ; `manager-ia` **reconcilié** = best-effort intentionnel (try/catch + rapport par action), une tx casserait le contrat → décision produit M150, pas un défaut. → M112.
- **DEBT-017 (⬜)** — deploy via `prisma db push` (`deploy.sh:140,179`) au lieu de `migrate deploy`. → M131.
- **DEBT-018 (✅ corrigé)** — seed : garde anti-prod + mots de passe via env + `mustChangePassword` sur défauts + impression conditionnelle. → M132. (Reste : `deploy.sh` lance encore le seed — voir M131.)

## 4. P2 — Robustesse / features

- **DEBT-020 (✅ corrigé)** — N+1 `replacement.ts` : overlap + heures hebdo calculés en mémoire sur `emp.shifts` (eager-loaded), 2N requêtes supprimées. → M113.
- **DEBT-021 (🔄 préparé, ops-gated)** — « FK » `String` sans relation. **Finding** : `PosTimeClock` EXCLU (résilience POS — FK casserait l'ingestion d'entités non synchronisées). Les 3 modèles internes (`ShiftExchange`, `ReplacementOffer`, `ShiftMarketListing`) : plan complet (schéma + onDelete + détection orphelins + migration auto-réparatrice) dans `docs/M114-FK-RELATIONS-PLAN.md`. Non appliqué : `db push` casserait le déploiement si orphelins → pré-vol DB requis (ops). → M114.
- **DEBT-022 (✅ boundaries / ⬜ RSC)** — `error.tsx`/`loading.tsx` sur les 4 groupes ((dashboard), (employee), (shared), inventory). Reste optionnel : conversion pages read-only en RSC (refactor séparé). → M115.
- **DEBT-023 (✅ résolu)** — tests ajoutés : RBAC (16), coût employeur+Decimal (7), utilitaires purs geo/shift/timeline (13). Suite 95→187 (+38 contraintes dures [constraints.ts complet] + 18 scoring solveur). Couverture comprehensive (suite 95→230). `scenario-scoring`/`suggestions` (agrégats) volontairement non testés : fixtures `SolverResult` lourdes + assertions fragiles = ROI négatif. → M116.
- **DEBT-024 (✅ corrigé)** — index ajoutés (`@@index` + migration `20260620180000`). → M122.
- **DEBT-025 (✅ corrigé)** — `notifications/clicked` : rate-limit IP ajouté (public by design — SW sans cookie ; écriture `clickedAt` non destructive). → M121.
- **DEBT-026 (⬜)** — pas de CI (lint/test/typecheck) sur PR. → M130.

## 5. P3 — Nettoyage

- **DEBT-030 (🔄)** — `next` bumpé 16.1.6→16.2.9 (CVE next éliminées). `nodemailer` : fix=9.0.1 **majeur breaking** → flag, non forcé. → M140.
- **DEBT-031 (✅ corrigé)** — logger conditionné `lib/logger.ts` ; **tout le codebase migré** (134 fichiers, ~273 `console.*` → `logger.*`) : `log`→`debug` (dev-only), `error`/`warn` conservés en prod. 0 `console.*` restant. → M141.
- **DEBT-032 (🔄 en cours)** — lint : `no-unused-vars` (81), `prefer-const` (2), `no-unescaped-entities` (9) **résorbés** (total eslint 178→85), config eslint durcie (`ignoreRestSiblings` pour ne pas casser les strips de secrets, `argsIgnorePattern '^_'`). `any` réduit **39→29** (callbacks `.map/.filter` result-mapping retypés par inférence + 8 directives eslint-disable orphelines retirées ; total lint 85→72). Reste : `where: any` Prisma (pattern dynamique défendable — types stricts révèlent surtout des casts string→enum à faible valeur), `set-state-in-effect` (30), `no-img-element` (8), hooks (3). Note : `(prisma as any)` dans `pos-feed/store-schedules` suggère un drift de typage Prisma à investiguer. → M142.
- **DEBT-033 (✅ corrigé)** — README périmé réécrit (56 modèles, modules M001–M015, 118 tests, variables d'env réelles, posture sécurité réelle, pointeurs docs de gouvernance + runbook rotation). → M143.
- **DEBT-034 (✅ corrigé)** — `firebase-debug.log`, `ai-engine-test-report.json`, 4 PNG racine retirés du suivi + `.gitignore`. → M144.

## Points sains (à préserver)
TS `strict` sans escape-hatch · Docker non-root multi-stage · `.env` gitignored · SW ne cache pas `/api/` · TLS 1.2/1.3 · invalidation session via `passwordChangedAt` · SQL brut paramétré (pas d'injection) · upload traversal contenu.

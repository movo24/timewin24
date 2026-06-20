# EXECUTION_LOG — TimeWin24

> Journal chronologique des actions exécutées. Append-only. Honnête : ce qui est vérifié l'est, le reste est marqué « non vérifié ».

## 2026-06-20 — Mise en place méthode modulaire + premiers P0/P1

### Docs de pilotage
- Créés : `MASTER_ROADMAP.md`, `PROJECT_STATUS.md`, `MODULE_SPECS.md`, `TECHNICAL_DEBT.md`, `EXECUTION_LOG.md`.
- Découpage : 15 modules fonctionnels (M001–M015) + backlog M100+ priorisé P0–P3.

### Correctifs exécutés
- **M104 / DEBT-013** — `employees/[id]/access/route.ts` : `Math.random` → `crypto.randomInt` pour PIN et code employé (CSPRNG). Vérifié : tsc 0, lint 0 sur le fichier.
- **M105 / DEBT-014** — sanitization des messages d'erreur : `ai/test/route.ts:100`, `ai/pos-analysis/route.ts:69`, `pos-feed/store-schedules/route.ts:44,104` → message générique, détail conservé en `console.error`. Retiré 2 `err: any` au passage.

### Vérifications (exécutées)
- `tsc --noEmit` : ✅ 0 erreur (après `prisma generate`).
- `jest` : ✅ 95/95.
- `eslint` (fichiers touchés) : access route ✅ 0 ; restants = dette `any` pré-existante (pos-feed/store-schedules, ai/test, ai/pos-analysis) — consignée DEBT-032.
- Comportement runtime : ⚠️ **non vérifié** (pas d'accès données/prod).

### Antérieur (même branche, sessions précédentes)
- M102 (inventory/auth rate-limit + lockout), M103 (inventory-jwt secret), retrait `next-pwa`, durcissement `setup-pos-integration.ts` + retrait `.playwright-mcp`, runbook rotation. CI Vercel verte.
- Site Wesley ajouté puis **reverté** (mauvais repo), préservé au commit `73570cc`.

### Bloquants réels (⛔)
- **M100** rotation secrets — accès DB/serveur/admin absents. Runbook prêt. Action ops.
- **M101** Float→Decimal — bloqué sur décision « données prod existantes ? ».
- **M120** rate-limiter Redis — infra absente.

### Correctif exécuté (suite)
- **M110 / DEBT-012** — `employees/[id]/access` : store-scoping manager via `getAccessibleStoreIds()` ; un non-admin hors périmètre → 403. Vérifié : tsc 0, lint 0 sur le fichier, jest 95/95. Runtime ⚠️ non vérifié. Reste : guard rôle ≥ (⬜).

### Note M122 (index)
Non exécuté : modifier `schema.prisma` sans pouvoir générer la migration (`prisma migrate dev` nécessite une DB absente) créerait un drift schéma/migrations. Laissé ⬜/specifié ; SQL de migration à produire côté ops, ou via `db push` au prochain déploiement.

### Prochaines actions automatiques (P1 faisables sans accès prod)
1. M112 — transactions sur écritures multiples (par route, prudemment).
2. M114 — relations Prisma manquantes (⚠️ migration → même contrainte que M122, à préparer sans appliquer).
3. M116 — tests RBAC `hasPermission` (ajout de couverture, sans accès prod).

### Correctif exécuté (suite 2)
- **M116 / DEBT-023** — `src/__tests__/rbac.test.ts` : 16 tests sur la matrice RBAC (permissions par rôle, hiérarchie, helpers admin, routes par défaut). Suite jest : **95 → 111 tests, 8 suites, vert**. Reste : tests coût employeur + solver.

### Correctif exécuté (suite 3)
- **M112 (partiel) / DEBT-016** — `shifts/duplicate` : créations enveloppées dans `prisma.$transaction` (atomique, plus de semaine à moitié dupliquée). Dédup intra-lot ajoutée (`plannedUnassigned`/`plannedAssigned`) pour préserver la sémantique séquentielle. Vérifié : tsc 0, lint 0, jest 111/111. Reste : manager-ia apply, toggle-status, absences/[id].

### Correctif exécuté (suite 4)
- **M112 (suite) / DEBT-016** — `stores/[id]/toggle-status` : désactivation atomique (`deleteMany` shifts futurs + `update` statut dans une `$transaction`). tsc 0, lint 0, jest 111/111. Reste M112 : manager-ia apply, absences/[id].

### Correctif execute (suite 5)
- **M112 (suite) / reconciliation** — `absences/[id]` : contrairement au texte d'audit, le coeur (statut + indisponibilites) etait DEJA transactionnel et la route DEJA store-scopee. Vrai defaut corrige : `createReplacementOffers` (best-effort, hors tx) pouvait throw APRES commit -> 500 trompeur sur une absence pourtant approuvee. Desormais try/catch + log, non-bloquant. tsc 0, lint 0, jest 111/111. Reste M112 : manager-ia apply (passe dediee).

### Reconciliation (suite 6) — M112 cloturee
- `planning/manager-ia` (`executeProposal`) **non modifie** : applique chaque action en try/catch isole et renvoie `applied`/`errors` par action = best-effort INTENTIONNEL. Une `$transaction` changerait la semantique visible (partiel -> tout-ou-rien) et casserait le contrat de rapport. Reclasse en decision produit (M150, P2), pas un bug. M112 close : 3 routes atomiques + 1 reconciliee.

### Correctif execute (suite 7)
- **M130 / DEBT-026** — `.github/workflows/ci.yml` cree : install + prisma generate + `tsc --noEmit` + `jest` (gates bloquants, verts aujourd'hui) ; eslint en step informatif non-bloquant (dette M142). Pure addition.

### Correctif execute (suite 8)
- **M132 / DEBT-018** — `prisma/seed.ts` durci : garde anti-prod (`ALLOW_PROD_SEED`), mots de passe via `SEED_ADMIN_PASSWORD`/`SEED_EMPLOYEE_PASSWORD` (defauts dev), `mustChangePassword=true` sur defauts, creds imprimes uniquement en mode defaut. tsc 0, jest 111/111.

### Correctif execute (suite 9)
- **M113 / DEBT-020** — `replacement.ts findEligibleCandidates` : suppression du N+1 (2 requetes DB/candidat). Overlap via `doTimesOverlap` (helper identique a findOverlappingShift) sur `emp.shifts` filtre au jour ; heures hebdo = somme en memoire de `emp.shifts` (meme fenetre que calculateWeeklyHours). Equivalence verifiee avant edit. tsc 0, lint 0, jest 111/111.

### Correctif execute (suite 10)
- **M115 / DEBT-022** — frontieres `error.tsx` + `loading.tsx` ajoutees sur les groupes `(dashboard)` et `(employee)` : retry sur erreur + spinner au chargement (au lieu d'ecran blanc/etat vide trompeur). tsc 0, lint 0, jest 111/111. Reste : conversion RSC des pages read-only (refactor plus large).

### Correctif execute (suite 11)
- **M144 / DEBT-034** — `git rm --cached` de `firebase-debug.log`, `ai-engine-test-report.json` et 4 PNG racine + regles `.gitignore`. Restent sur disque, retires du suivi.

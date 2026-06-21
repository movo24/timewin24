# MASTER_ROADMAP — TimeWin24

> Découpage modulaire pilotable. Statuts : ✅ Fait · 🔄 En cours · ⬜ À faire · ⚠️ À vérifier · ⛔ Bloqué réel.
> Priorités : P0 (prod/sécu/argent/données) · P1 (intégrité/auth/perm) · P2 (features/UX/back-office) · P3 (nettoyage/doc).
> **Convention « Fait »** : code présent + `tsc` OK + tests OK quand pertinents. Le **comportement runtime** des modules existants est **⚠️ non vérifié** (pas d'accès données) — voir colonne validation.

---

## PARTIE A — Modules fonctionnels existants (inventaire du repo)

> Ces modules ont du code en place et passent `tsc`/tests. Statut ⚠️ = à valider en runtime + dette connue (cf. TECHNICAL_DEBT).

### M001 — Socle Auth & RBAC & Sécurité
Statut : ⚠️ À vérifier (code OK, dette sécurité résiduelle) · Priorité : P1
Dépendances : — (socle)
Objectif : authentifier, autoriser (rôles), garder les routes, clés API service.
Fichiers : `src/lib/auth.ts`, `rbac.ts`, `api-helpers.ts`, `inventory-jwt.ts`, `rate-limit.ts`, `hmac.ts`, `pos-auth.ts`, `src/middleware.ts`
API : `auth/*`, `accounts/*`, `me/*`, `service-keys/*`
Base : `User`, `ServiceApiKey`
Tests attendus : matrice RBAC (`hasPermission` par rôle), lockout, invalidation session via `passwordChangedAt`.
Validation : ✅ invalidation session vérifiée (auth.ts:128-147) ; ⬜ tests RBAC absents ; ⚠️ rate-limit en mémoire (M120).

### M002 — Organisation & Magasins
Statut : ⚠️ À vérifier · Priorité : P2
Objectif : structure multi-boutiques, horaires, affectations employé↔magasin.
Fichiers : `src/lib/geo.ts` · Pages : `(dashboard)/stores` · API : `stores/*`, `organizations/*`, `units/*`
Base : `Organization`, `Unit`, `Store`, `StoreSchedule`, `StoreEmployee`
Validation : ⚠️ cascades de suppression dangereuses (M111).

### M003 — Employés / RH
Statut : ⚠️ À vérifier · Priorité : P2
Pages : `(dashboard)/employees` · API : `employees/*`, `unavailabilities/*` · Base : `Employee`, `Unavailability`
Validation : ⚠️ route `employees/[id]/access` sur-permissive (M110).

### M004 — Planning & Shifts (cœur métier)
Statut : ⚠️ À vérifier · Priorité : P2
Objectif : génération/édition planning, solver, assistant IA manager.
Fichiers : `src/lib/solver/*`, `manager-ia/*`, `shifts.ts`, `shift-utils.ts`, `timeline-utils.ts` · hook `useShiftDrag.ts`
Pages : `(dashboard)/planning`, `(employee)/mon-planning` · API : `planning/*`, `shifts/*` · Base : `Shift`
Tests : ✅ solver shift-construction, overlap, snapshot-hash (existants).
Validation : ⚠️ `manager-ia` apply sans transaction (M112) ; couverture solver partielle.

### M005 — Pointage & Présence
Statut : ⚠️ À vérifier · Priorité : P2
Pages : `pointages`, `(employee)/pointage` · API : `attendance/*`, `clock-in/*` · Base : `ClockIn`

### M006 — Absences · Remplacements · Échanges · Marché de shifts
Statut : ⚠️ À vérifier · Priorité : P2
Fichiers : `src/lib/replacement.ts`, `marketplace.ts`, `reliability-score.ts`
Pages : `absences`, `remplacements`, `echanges`, `marche-shifts`, `mes-absences`, `mes-remplacements`
API : `absences/*`, `replacements/*`, `shift-exchanges/*`, `market-listings/*`
Base : `AbsenceDeclaration`, `ReplacementOffer`, `ReplacementCandidate`, `ShiftExchange`, `ShiftMarketListing`, `ReliabilityScoreHistory`
Validation : ⚠️ N+1 dans `replacement.ts` (M113) ; `String` FK sans relation (M114).

### M007 — Coûts & Masse salariale
Statut : ⚠️ À vérifier · Priorité : P1
Fichiers : `src/lib/employer-cost.ts` · Pages : `costs` · API : `costs/*` · Base : `EmployeeCost`, `CountryConfig`
Validation : ✅ **tous les montants € en `Decimal`** (M101 paie + M101b LOT A/B/C/D : POS, produits, étiquettes, analytics). Plus aucun montant en `Float`.

### M008 — POS & Intégrations
Statut : ⚠️ À vérifier · Priorité : P1
Objectif : connexion CAISSE, sync ventes/pointages, webhooks HMAC.
Fichiers : `src/lib/pos/*` · Pages : `integrations` · API : `integrations/pos/*`, `pos-events/*`, `pos-feed/*`, `connected-apps/*`
Base : `PosProvider`, `PosStoreLink`, `PosEmployeeLink`, `PosTimeClock`, `PosSalesData`, `PosSyncLog`, `ConnectedApp`, `PosEvent`
Validation : ✅ HMAC vérifié sûr ; ⚠️ secret POS en clair en historique (incident, ⛔ ops).

### M009 — Inventaire (app mobile)
Statut : ⚠️ À vérifier · Priorité : P2
Pages : `inventory/{login,home,scan,counts,history}` · API : `inventory/*`, `products/*`
Base : `InventorySession`, `InventoryCount`, `Product`, `IdempotencyKey`
Validation : ✅ login durci (C1/H1, cette session).

### M010 — Étiquettes / Labels
Statut : ⚠️ À vérifier · Priorité : P3
Fichiers : `src/lib/labels/*` · Pages : `etiquettes` · API : `labels/*` · Base : `LabelTemplate`, `LabelPrintJob`, `LabelPrintItem`

### M011 — Messagerie & Communication RH
Statut : ⚠️ À vérifier · Priorité : P2
Pages : `messages`, `annonces`, `fil-actualite`, `mes-messages` · API : `messages/*`, `feed/*`, `broadcasts/*`
Base : `HrMessage`, `MessageAttachment`, `FeedPost`, `FeedComment`, `Broadcast`, `BroadcastStore`

### M012 — Notifications
Statut : ⚠️ À vérifier · Priorité : P2
Fichiers : `src/lib/notifications/*` · Pages : `notifications`, `mes-notifications` · API : `notifications/*`
Base : `PushSubscription`, `NotificationPreference`, `NotificationLog`, `PlanningNotification`
Validation : ✅ tests planning-email/notify-rbac/validation existants ; ⚠️ `notifications/clicked` non authentifié (M121).

### M013 — Analytics & Performance employé
Statut : ⚠️ À vérifier · Priorité : P2
Fichiers : `src/lib/analytics/*` · Pages : `performance` · API : `analytics/*`, `dashboard/*`
Base : `EmployeePerformanceDaily/Hourly/Score`, `EmployeeAiMetrics`

### M014 — IA Engine
Statut : ⚠️ À vérifier · Priorité : P2
Fichiers : `src/lib/ai-engine/*` · API : `ai/*` · Base : `AiEmbedding`, `AiAnomaly`, `AiConversation`, `AiMessage`, `AiApiUsage`
Validation : ✅ M11 (fuites d'erreur) corrigé cette session.

### M015 — Alertes · Audit · Journal
Statut : ⚠️ À vérifier · Priorité : P2
Fichiers : `src/lib/alerts.ts`, `audit.ts` · Pages : `alertes`, `audit`, `journal` · API : `alerts/*`, `audit/*`, `journal/*`
Base : `ManagerAlert`, `AuditLog`, `JournalEntry`

**Transverse** : `prisma.ts`, `validations.ts`, `utils.ts`, `uploads.ts`, `health`.

---

## PARTIE B — Backlog d'exécution (tâches numérotées)

### 🔴 P0 — Sécurité critique / données

#### M100 — Rotation des 3 credentials fuités
Statut : ⛔ Bloqué réel (ops) · Priorité : P0
Dépendances : accès DB prod / serveur CAISSE / compte admin (absents en session).
Scope : rotation admin + rôle `caisse` + `POS_SECRET` (swap in-place), puis purge historique.
Préparé : `docs/SECURITY-ROTATION-RUNBOOK.md` (SQL, ordre, verify-gate). **Action ops** — rien d'autre exécutable ici.
Validation : ancien secret → rejeté ; nouveau → accepté.

#### M102 — Brute-force inventory/auth
Statut : ✅ Fait · Priorité : P0 · Fichier : `api/inventory/auth/route.ts`
Validation : ✅ rate-limit + lockout partagé ajoutés ; tsc/jest OK ; runtime ⚠️ non vérifié.

#### M103 — Secret JWT inventaire en dur
Statut : ✅ Fait · Priorité : P0 · Fichier : `lib/inventory-jwt.ts`
Validation : ✅ fallback supprimé, `INVENTORY_JWT_SECRET`/`NEXTAUTH_SECRET` requis.

### 🟠 P1 — Intégrité / auth / argent

#### M101 — Argent `Float` → `Decimal` (noyau paie)
Statut : ✅ Fait (noyau paie/coût) · Priorité : P1 · Module : M007
Débloqué : réponse user « pas encore de données monétaires en prod » → migration **additive** (fenêtre idéale).
Fait : `CountryConfig` (minimumWageHour, employerRate, reductionMaxCoeff, reductionThreshold, extraHourlyCost) + `EmployeeCost` (hourlyRateGross, fixedMissionCost, employerRateOverride, extraHourlyCostOverride) → `Decimal` (€ = `@db.Decimal(12,2)`, coefficients = `(6,4)`). Migration `20260620190000_money_float_to_decimal`.
Frontière : `src/lib/decimal.ts` (`toNum`/`toNumN`) + `src/lib/cost-mappers.ts` (`countryRulesFromConfig`, serializers). Moteur `employer-cost.ts` reste pur-`number`. **Forme des réponses API préservée** (Decimal recoercé en `number` → zéro changement front).
Validation : ✅ tsc 0 ; ✅ jest 118 (+7 : math moteur + frontière Decimal) ; runtime ⚠️ non vérifié.
Reste (⬜ M101b, P2) : champs € hors paie — `PosSalesData`, `Product.price/oldPrice/vatRate`, `Store.vatRate`, `EmployeePerformanceDaily/Hourly` (totalSales/avgBasket/amounts). ~35 fichiers, dont des chemins de sérialisation API non vérifiables en l'état (pas de données) → lot dédié.

#### M110 — `employees/[id]/access` : store-scoping manager
Statut : ✅ Fait (store-scoping) · Priorité : P1 · Module : M003
Scope : un MANAGER ne gère l'accès que des employés de ses magasins (`getAccessibleStoreIds`).
Validation : ✅ check `storeEmployee` ajouté (non-admin → 403 hors périmètre) ; tsc/lint/jest OK ; runtime ⚠️ non vérifié.
Reste (⬜) : interdire d'agir sur une cible de rôle ≥ (employé lié à un user ADMIN).

#### M104 — PIN/code en CSPRNG
Statut : ✅ Fait · Priorité : P1 · Fichier : `employees/[id]/access/route.ts`
Validation : ✅ `Math.random` → `crypto.randomInt` ; tsc/lint OK.

#### M111 — Cascades de suppression destructrices
Statut : ✅ Fait · Priorité : P1 · Module : M002
Fait : 5 relations `Cascade` → **`Restrict`** protégeant les preuves RH/légales — `Shift→Store`, `ClockIn→{Employee,Store}`, `AbsenceDeclaration→Employee`, `EmployeeCost→Employee`. Migration `20260621160000_protect_evidence_restrict` (DROP/ADD FK `ON DELETE RESTRICT`). `Shift→Employee` laissé `SetNull` (le shift survit, pas de perte). Routes `DELETE stores/[id]` + `employees/[id]` : traduisent le FK violation (`P2003`) en **409 clair** (« historique présent → désactivez »).
Validation : tsc 0, jest 118 ; runtime ⚠️ non vérifié (pas de DB ; migration s'applique via `db push`/`migrate deploy`). Cascades légitimes (POS, feed, conversations, inventaire, étiquettes, jonctions) **non touchées**.

#### M112 — Transactions sur écritures multiples
Statut : ✅ Fait (3 routes) + 1 reconciliée (décision produit) · Priorité : P1
- ✅ `shifts/duplicate` — créations en `$transaction` + dédup intra-lot préservée.
- ✅ `stores/[id]/toggle-status` — désactivation (deleteMany shifts + update statut) atomique.
- ✅ `absences/[id]` — **reconcilié** : le cœur (statut+indispos) était DÉJÀ transactionnel et la route DÉJÀ store-scopée ; vrai défaut = `createReplacementOffers` throw après commit → 500 trompeur. Corrigé : best-effort non-bloquant (try/catch + log).
- 🟦 `planning/manager-ia` (`executeProposal`) — **reconcilié** : applique chaque action en try/catch isolé et rapporte `applied`/`errors` par action = **best-effort intentionnel**. Une `$transaction` casserait ce contrat (partiel → tout-ou-rien). → **décision produit** (apply atomique optionnel) = M150, PAS un bug. Non modifié.

#### M120 — Rate-limiter partagé (Redis)
Statut : ⛔ Bloqué (infra) · Priorité : P1
Dépendances : instance Redis + config. En mémoire actuellement (reset par déploiement, ×N instances, `x-forwarded-for` spoofable).

#### M105 — Fuites de message d'erreur
Statut : ✅ Fait · Priorité : P1
Validation : ✅ ai/test, ai/pos-analysis, pos-feed/store-schedules → message générique ; détail en console.

### 🟡 P2 — Features / robustesse

#### M113 — N+1 `replacement.ts`
Statut : ✅ Fait · Priorité : P2 · Fichier : `src/lib/replacement.ts`
Remplacé `findOverlappingShift` + `calculateWeeklyHours` (2 requêtes DB/candidat) par des calculs en mémoire sur `emp.shifts` (déjà eager-loaded). Overlap via `doTimesOverlap` (même helper). tsc/lint/jest OK.

#### M101b — `Float` → `Decimal` (champs € hors paie)
Statut : ✅ **Fait (LOT A+B+C+D)** · Priorité : P2 · Module : M008/M009/M013
- ✅ **LOT C** : `PosSalesData.revenue/cardAmount/cashAmount/otherAmount` → `Decimal(12,2)`.
- ✅ **LOT D** : `EmployeePerformanceDaily.totalSales/avgBasket/cashAmount/cardAmount/salesPerHour` + `EmployeePerformanceHourly.sales` → `Decimal(12,2)`.
- Migration `20260621140000_money_float_to_decimal_lot_cd`. Méthode **parité-sûre** : `toNum` à la frontière → l'arithmétique reste en `number` à l'identique (35 sites de calcul recâblés, guidés par `tsc`), seul le STOCKAGE devient exact → **aucune dérive analytics/IA possible**. Aucune donnée de test requise.
- **Bug runtime corrigé** : `pos-events/webhook` faisait `existing.totalSales (Decimal) + revenue (any payload)` → concaténation de chaîne au runtime (invisible à tsc). Désormais `toNum(existing.totalSales) + revenue` (2 blocs). Sérialisation `dailyTrend` recoercée.
- Vérifié : prisma validate OK, tsc 0, jest 118. Build Vercel = garde-fou.
- ✅ **LOT A** (taux/%) : `Store.vatRate`, `Product.vatRate` → `Decimal(6,4)` ; `Employee.maxDiscountPct` → `Decimal(5,2)`.
- ✅ **LOT B** (catalogue/étiquettes) : `Product.price/oldPrice`, `LabelPrintItem.priceAtPrint` → `Decimal(12,2)`.
- Migration `20260621120000_money_float_to_decimal_lot_ab`. Frontière : `src/lib/money-serialize.ts` (serializeProduct/serializeStoreVat/serializeLabelJob) + `decimal.ts`. Forme JSON (number) préservée → composants labels/catalogue (`.toFixed`) intacts. Bug corrigé au passage : `products/[id]` comparait `data.price !== existing.price` (number vs Decimal, toujours vrai) → `toNumN(existing.price)`.
- Vérifié : tsc 0, jest 118, build Vercel = garde-fou. Runtime ⚠️ non vérifié (pas de données ; impression PDF/ZPL non exécutée — chemins de valeurs tous coercés en number).
- ⬜ **LOT C** (`PosSalesData` ventes) + **LOT D** (`EmployeePerformanceDaily/Hourly`) : gatés sur jeu de données (parité analytics/IA). Voir `docs/M101b-AUDIT.md`.
Scope : `PosSalesData` (revenue, cardAmount, cashAmount, otherAmount), `Product.price/oldPrice/vatRate`, `Store.vatRate`, `EmployeePerformanceDaily/Hourly` (totalSales, avgBasket, montants).
Note : ~20 fichiers consommateurs (POS sync, analytics, labels, AI engine, dashboards) dont plusieurs sérialisent ces champs en réponse API. Même méthode que M101 (frontière `decimal.ts`/serializers, forme JSON préservée), mais non vérifiable en runtime sans données → à exécuter avec données de test ou en fenêtre contrôlée.
**Audit statique livré (sans code)** : `docs/M101b-AUDIT.md` — 4 lots priorisés : LOT A (taux/% : `Store.vatRate`, `Product.vatRate`, `Employee.maxDiscountPct`) **risque faible, faisable sans données** ; LOT B (catalogue/étiquettes : `Product.price/oldPrice`, `LabelPrintItem.priceAtPrint`) **moyen** ; LOT C (`PosSalesData` ventes) **élevé, gaté jeu de données** ; LOT D (`EmployeePerformanceDaily/Hourly`) **moyen-élevé, après C**. En attente d'arbitrage A/B vs C/D.

#### M114 — « FK » String sans relation
Statut : 🔄 **Préparé (plan), application ops-gated** · Priorité : P2 · Plan : `docs/M114-FK-RELATIONS-PLAN.md`
- **Finding** : `PosTimeClock` **exclu** délibérément — données importées du POS pouvant référencer un employé/magasin non encore synchronisé ; une FK stricte casserait l'ingestion (le webhook ne bloque pas sur entité inconnue). La relation-absence y est intentionnelle.
- 3 modèles internes à relier (`ShiftExchange`, `ReplacementOffer`, `ShiftMarketListing`) : schéma cible + politiques `onDelete` (alignées M111) + SQL de détection d'orphelins + migration auto-réparatrice documentés dans le plan.
- **Non appliqué** : repo déploie via `db push` → ajouter une FK avec orphelins casserait le déploiement. Requiert pré-vol DB (ops) avant application.

#### M115 — Frontières error/loading (front)
Statut : ✅ Fait (boundaries) · Priorité : P2
- ✅ `error.tsx` + `loading.tsx` sur les 4 groupes utilisateur : `(dashboard)`, `(employee)`, `(shared)`, `inventory` (mobile). Plus d'écran blanc / état figé.
- ⬜ Reste (optionnel, refactor séparé) : conversion des pages read-only en RSC.

#### M116 — Tests chemins critiques
Statut : 🔄 En cours · Priorité : P2
- ✅ RBAC : `src/__tests__/rbac.test.ts` (16 tests — matrice par rôle, hiérarchie, helpers, routes par défaut).
- ✅ Coût employeur : `src/__tests__/employer-cost.test.ts` (7 tests).
- ✅ Utilitaires purs : `src/__tests__/pure-utils.test.ts` (13 tests — geo/haversine + rayon pointage GPS, doTimesOverlap/calculateShiftHours, timeToMinutes/snapMinutes/clampMinutes). Suite : 95 → **131**.
- ✅ Contraintes dures solveur : `src/__tests__/solver-constraints.test.ts` (19 tests — isNoOverlap, isAvailable FIXED/VARIABLE, daily/weekly max, hasEnoughRest 11h FR). Suite **131→150**.
- ⬜ Reste : scoring/scénarios solveur ; `deriveProfileCategory` à extraire de `reliability-score` (co-localisé Prisma).

#### M121 — `notifications/clicked` non authentifié
Statut : ✅ Fait · Priorité : P2 — endpoint public (SW sans cookie) durci par rate-limit IP (`RATE_LIMITS.api`, 429 si dépassé). Écriture `clickedAt` non destructive ; abus limité. tsc 0 / jest 118.

#### M122 — Index manquants
Statut : ✅ Fait · Priorité : P2 · `schema.prisma` + migration `20260620180000_add_missing_indexes`
`@@index` ajoutés : `PosTimeClock.shiftId`, `AuditLog.userId`, `ReplacementOffer.absentEmployeeId`. Migration créée (s'applique via `migrate deploy` ou `db push`). validate ✅, tsc/jest OK.

#### M150 — Manager-IA : mode apply atomique (optionnel)
Statut : ⬜ À faire (décision produit) · Priorité : P2 · Module : M004
Contexte : `executeProposal` est best-effort (applique ce qui passe, rapporte le reste). 
Question produit : veux-tu une option "tout-ou-rien" (`$transaction`) pour l'apply d'un plan IA ?
Si oui : ajouter un flag `atomic` ; sinon garder le best-effort actuel. Aucun bug en l'état.

#### M130 — CI GitHub Actions
Statut : ✅ Fait · Priorité : P2 · Fichier : `.github/workflows/ci.yml`
Gates bloquants : `prisma generate` → `tsc --noEmit` → `jest` (verts). Lint informatif non-bloquant (dette M142).

#### M131 — Deploy : `db push` → `migrate deploy`
Statut : ⬜ À faire · Priorité : P1 — `deploy.sh` utilise `prisma db push` (perte de données possible).

#### M132 — Seed durci
Statut : ✅ Fait · Priorité : P1 · Fichier : `prisma/seed.ts`
- Garde anti-prod (throw si `NODE_ENV=production` sans `ALLOW_PROD_SEED=true`).
- Mots de passe via `SEED_ADMIN_PASSWORD`/`SEED_EMPLOYEE_PASSWORD` (défauts dev seulement).
- `mustChangePassword=true` quand défauts utilisés ; creds imprimés uniquement en mode défaut dev.

### 🟢 P3 — Nettoyage / doc

#### M140 — Dépendances vulnérables
Statut : 🔄 En cours · P1/P3
- ✅ `next` 16.1.6 → **16.2.9** (CVE smuggling/DoS/CSRF du paquet `next` éliminées) + `eslint-config-next` aligné. tsc/jest OK ; **build Vercel vérifié vert sur les 3 projets** (timewin24, -el97, -saas-appstore) pour `f26deac` → bump validé build.
- ⚠️ `nodemailer` : fix = `9.0.1` (**bump majeur 7→9, breaking**) → **non forcé** (risque sur l'envoi d'emails). À planifier + tester.
#### M141 — `console.*` → logger conditionné · ✅ Fait · P3
- ✅ `src/lib/logger.ts` : `error`/`warn` toujours émis (observabilité prod), `info`/`debug` hors-prod uniquement (ou `LOG_LEVEL=debug`).
- ✅ **Tout le codebase migré** : `src/lib` (16 fichiers) + `src/app`/`src/components` (118 fichiers). `console.log`→`logger.debug` (bruit prod supprimé), `console.error/warn` conservés. **0 `console.*` restant** hors `logger.ts`. tsc 0, jest 131, eslint inchangé (85).
#### M142 — Dette lint · 🔄 En cours · P3
- ✅ `no-unused-vars` (81) + `prefer-const` (2) résorbés (imports/vars morts retirés, params `_`-préfixés). **−75 lignes nettes**, tsc 0 / jest 118.
- ✅ `eslint.config.mjs` durci : `ignoreRestSiblings` (les destructurations « omettre » qui **strip des secrets** ne sont plus signalées — évite un "fix" qui aurait **leak** `refreshToken`/`apiSecret`), `argsIgnorePattern '^_'`, `caughtErrors none`, ignore `src/generated/**`.
- ✅ `react/no-unescaped-entities` (9) corrigé (apostrophes → `&apos;`, guillemets JSX → `&quot;`).
- ⬜ Reste (runtime-sensible, non touché délibérément) : `no-explicit-any` (39), `react-hooks/set-state-in-effect` (30), `@next/next/no-img-element` (8), hooks refs/deps (3).
#### M143 — README périmé · ✅ Fait · P3 — réécrit pour refléter le réel (56 modèles, 15 modules M001–M015, 118 tests, env vars réelles, sécurité réelle, pointeurs gouvernance/runbook).
#### M144 — Hygiène repo · ✅ Fait · P3 — `firebase-debug.log`, `ai-engine-test-report.json`, 4 PNG racine retirés du suivi + `.gitignore` mis à jour. (`.playwright-mcp` déjà retiré.)

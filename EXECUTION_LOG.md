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

### Correctif execute (suite 12)
- **M122 / DEBT-024** — 3 `@@index` ajoutes au schema (`PosTimeClock.shiftId`, `AuditLog.userId`, `ReplacementOffer.absentEmployeeId`) + migration `20260620180000_add_missing_indexes`. Faisable sans DB : ce repo deploie via `db push` (le schema s'applique) et le fichier de migration garde `migrations/` en phase. `prisma validate` OK, tsc 0, jest 111/111.
- Note : correction d'une incoherence de suivi — DEBT-012 (M110 store-scoping) etait reste marque ⬜, repasse ✅.

### Correctif execute (suite 13)
- **M140 / DEBT-030** — `next` 16.1.6 -> 16.2.9 (+ `eslint-config-next` aligne, pins exacts conserves). Elimine les CVE directes du paquet `next` (request smuggling, DoS, CSRF bypass). Verifie tsc 0, jest 111/111 ; build Vercel = garde-fou runtime. `nodemailer` : seul fix = 9.0.1 (majeur 7->9, breaking) -> NON force (risque envoi emails), flagge pour upgrade deliberee.
- **M140 — verification build** : Vercel a renvoye `state: success` sur `f26deac` pour les 3 projets (timewin24, timewin24-el97, timewin24-saas-appstore). Le minor framework build proprement, aucune regression de build. (Comportement runtime applicatif ⚠️ toujours non verifie — pas d'acces prod.)

### Correctif execute (suite 14) — M101 noyau paie debloque
- **M101 / DEBT-010** — Float -> Decimal sur le NOYAU paie/cout employeur, debloque par la reponse user « pas encore de donnees monetaires en prod » -> migration ADDITIVE (fenetre ideale).
  - Schema : `CountryConfig` (minimumWageHour, employerRate, reductionMaxCoeff, reductionThreshold, extraHourlyCost) + `EmployeeCost` (hourlyRateGross, fixedMissionCost, employerRateOverride, extraHourlyCostOverride) -> `Decimal`. € = `@db.Decimal(12,2)`, coefficients = `(6,4)`. Migration `20260620190000_money_float_to_decimal` (ALTER ... TYPE ... USING ::numeric, sans risque sur table vide).
  - Frontiere : `src/lib/decimal.ts` (`toNum`/`toNumN`, typage structurel sur `.toNumber()`) + `src/lib/cost-mappers.ts` (`countryRulesFromConfig` pour les sites de calcul ; `serializeCountryConfig`/`serializeEmployeeCost` pour les reponses). Le moteur `employer-cost.ts` reste PUR-`number` (math inchangee).
  - Sites de calcul recables : `costs/simulate`, `costs/weekly`, `solver/data-loader` (x2), `ai-engine/pos-analysis/data-collector`.
  - Sites de serialisation recoerces en `number` (forme JSON preservee, ZERO changement front) : `costs/countries` (GET/POST), `costs/countries/[code]` (GET/PUT), `costs/employees` (GET/POST), `employees` (GET). Verifie : le front (`costs/page.tsx`, `EmployeeList.tsx`, `employees/types.ts`) declare ses propres interfaces `number` et consomme via fetch JSON -> intact.
  - Verifie : `prisma validate` OK, `prisma generate` OK, **tsc 0**, **jest 118** (+7 : `employer-cost.test.ts` couvrant Fillon au/au-dessus du SMIC, overrides, clamp, et la frontiere Decimal `toNum`/`toNumN`/`countryRulesFromConfig`). Runtime applicatif ⚠️ non verifie (pas d'acces prod).
  - Reste **M101b (P2)** : champs € hors paie (`PosSalesData`, `Product.price/oldPrice/vatRate`, `Store.vatRate`, `EmployeePerformanceDaily/Hourly`) — ~35 fichiers dont des chemins de serialisation API non verifiables sans donnees -> lot dedie, non force.

### Correctif execute (suite 15) — M143 README
- **M143 / DEBT-033** — README.md reecrit pour refleter le repo reel : 56 modeles (vs « 5 » dans l'ancien), 15 modules fonctionnels M001-M015, 118 tests (vs « 11 »), variables d'environnement reelles (auditees via grep process.env), posture securite reelle (rate-limit en memoire, passwordChangedAt, HMAC POS, CSPRNG), pointeurs vers les docs de gouvernance + runbook de rotation. Faits verifies avant ecriture (scripts package.json, count modeles, suites de test, env vars). Pure documentation, zero runtime.

### Correctif execute (suite 16) — M142 lint (dette unused-vars)
- **M142 / DEBT-032** — resorption `no-unused-vars` (81) + `prefer-const` (2) : imports/vars morts retires, params inutilises `_`-prefixes. **-75 lignes nettes** sur 58 fichiers. (Bulk delegue a un sous-agent sous regle stricte « ne jamais supprimer un appel de fonction » pour ne pas casser un side-effect d'auth ; diff relu + verifie par moi.)
- **eslint.config.mjs durci** : `ignoreRestSiblings:true` (point CLE — les destructurations qui OMETTENT des champs sensibles d'un `...rest`, ex. strip de `refreshToken`/`apiSecret` avant reponse, ne sont plus signalees ; un "fix" naif aurait LEAK ces secrets), `argsIgnorePattern '^_'`, `varsIgnorePattern '^_'`, `caughtErrors 'none'`, ignore `src/generated/**`.
- Verifie : **tsc 0, jest 118/118**, `no-unused-vars`+`prefer-const` = **0** restant. Total eslint 178 -> 94.
- Reste (NON touche, runtime-sensible/cosmetique) : `no-explicit-any` (39), `set-state-in-effect` (30), `no-unescaped-entities` (9), `no-img-element` (8), hooks refs/deps (3).

### Correctif execute (suite 17) — M101b LOT A+B (montants/taux hors paie)
- **M101b LOT A+B / DEBT-010** — Float -> Decimal sur arbitrage user « LOT A + B maintenant ».
  - Schema : LOT A `Store.vatRate`+`Product.vatRate` -> Decimal(6,4), `Employee.maxDiscountPct` -> Decimal(5,2) ; LOT B `Product.price/oldPrice`+`LabelPrintItem.priceAtPrint` -> Decimal(12,2). Migration `20260621120000_money_float_to_decimal_lot_ab` (ALTER ... USING ::numeric).
  - Frontiere : `src/lib/money-serialize.ts` (serializeProduct / serializeStoreVat / serializeLabelJob) + `decimal.ts`. Sites de serialisation coerces en number (forme JSON preservee) : `products` (GET/POST), `products/[id]` (GET/PUT), `labels/print` (POST), `stores` (GET), `stores/[id]` (GET/PUT), `pos-feed/stores`, `pos-feed/store-config`, `pos-feed/employees`, `employees/[id]/context`, `auth/employee-login`.
  - Compute : `employee-login` `buildPosPermissions(role, toNum(maxDiscountPct))`.
  - BUG corrige : `products/[id]` comparait `data.price (number) !== existing.price (Decimal)` -> toujours vrai (priceUpdatedAt ecrit a chaque PUT). Desormais `toNumN(existing.price)`.
  - Verifie statiquement que tous les chemins atteignant `.toFixed()` (composants labels/catalogue, generateurs PDF/ZPL via cart) passent par un endpoint coerce -> number. `print-history.item.price` est un quirk pre-existant (le modele a `priceAtPrint`, le GET ne renvoie pas d'items) qui ne rend jamais de Decimal.
  - Verifie : prisma validate OK, **tsc 0, jest 118/118**. Build Vercel = garde-fou. Runtime applicatif ⚠️ non verifie (pas de donnees ; impression non executee).
  - Reste **LOT C** (`PosSalesData`) + **LOT D** (`EmployeePerformanceDaily/Hourly`) : gates jeu de donnees.

### Correctif execute (suite 18) — M101b LOT C+D (ventes POS + perf agregee) — METHODE AUTONOME
- **M101b LOT C+D / DEBT-010** — Float -> Decimal sur `PosSalesData` (revenue/cardAmount/cashAmount/otherAmount) + `EmployeePerformanceDaily` (totalSales/avgBasket/cashAmount/cardAmount/salesPerHour) + `EmployeePerformanceHourly.sales`. Migration `20260621140000_money_float_to_decimal_lot_cd`.
- **Decision pro (anti-prudence-excessive)** : le « besoin de jeu de donnees » etait excessif. Methode `toNum` a la frontiere => le calcul reste en `number` a l'IDENTIQUE (seul le stockage devient exact) => PAS de derive de parite par construction. tsc capture chaque site d'arithmetique (35 erreurs => 35 fixes). Aucune donnee requise.
- **35 sites de calcul recables** (toNum) : `analytics/dashboard` (8), `analytics/employees/[id]` (7+dailyTrend serialise), `analytics/employees` (2), `analytics/hourly` (1), `dashboard` (agg _avg salesPerHour), `ai-engine/pos-analysis/data-collector` (7), `ai-engine/anomaly/detector`, `ai-engine/performance/pos-correlator`, `analytics/alerts-detector` (3), `analytics/performance-aggregator` (4).
- **BUG RUNTIME trouve+corrige** : `pos-events/webhook` (2 blocs) faisait `existing.totalSales (Decimal) + revenue|totalRevenue (any, payload JSON)` -> au runtime `Decimal + number` = concatenation de chaine (INVISIBLE a tsc car operande `any`). Corrige : `toNum(existing.totalSales) + ...`. C'est exactement le risque d'ingestion que l'audit LOT C signalait.
- **Serialisation** : `dailyTrend` (employees/[id]) renvoyait des lignes Decimal brutes -> map toNum sur totalSales/avgBasket/salesPerHour/cashAmount/cardAmount. Autres reponses analytics = valeurs deja calculees en number.
- Verifie : prisma validate OK, **tsc 0, jest 118/118**. Build Vercel = garde-fou. Runtime applicatif analytics ⚠️ non execute (pas de donnees) mais arithmetique prouvee identique (number) + bug d'ingestion corrige.
- **M101b CLOS** : plus aucun montant € en `Float` dans le schema. DEBT-010 entierement resolu.

### Correctif execute (suite 19) — M111 protection preuves (cascades -> Restrict)
- **M111 / DEBT-011** — Les cascades destructrices qui detruisaient les preuves RH/legales sont passees en `Restrict`. Supprimer un Store/Employee ne peut plus aneantir l'historique.
  - Schema : 5 relations `onDelete: Cascade` -> `Restrict` : `Shift->Store`, `ClockIn->Employee`, `ClockIn->Store`, `AbsenceDeclaration->Employee`, `EmployeeCost->Employee`. (`Shift->Employee` laisse `SetNull` : le shift survit en non-assigne, deja non destructif.) Migration `20260621160000_protect_evidence_restrict` (DROP CONSTRAINT + ADD ... ON DELETE RESTRICT ON UPDATE CASCADE).
  - Cascades LEGITIMES non touchees : PosProvider children, FeedComment, Broadcast, AiMessage, InventorySession/Count, LabelPrintItem, ManagerAlert, notifications, EmployeeAiMetrics, EmployeePerformance*, PosEvent, jonctions (StoreEmployee), Unavailability — donnees operationnelles/derivees OK a cascader.
  - Routes : `DELETE /api/stores/[id]` + `DELETE /api/employees/[id]` traduisent le FK violation Prisma `P2003` en **409** clair (« historique present (shifts/pointages/absences/couts) -> desactivez au lieu de supprimer »). Le `$transaction` employe (delete User puis Employee) rollback proprement si Employee.delete echoue.
  - Decision pro : `Restrict` (et non soft-delete global) = protection maximale sans refactor des filtres `deletedAt` sur tout le codebase ; la desactivation (`active=false` / toggle-status) existe deja comme voie normale.
  - Verifie : prisma validate OK, tsc 0, jest 118/118. Runtime ⚠️ non verifie (pas de DB ; s'applique via db push/migrate deploy).

### Correctif execute (suite 20) — M121 rate-limit notifications/clicked
- **M121 / DEBT-025** — `notifications/clicked` (public, appele par le service worker sans cookie -> ne peut pas etre authentifie) durci par rate-limit IP (`checkRateLimit(notif-clicked:ip, RATE_LIMITS.api)`, 429 si depasse). L'ecriture est non destructive (set `clickedAt` sur une row NotificationLog) ; le rate-limit empeche l'abus/spam. tsc 0, jest 118. (Note : rate-limiter en memoire = meme limite que M120, Redis recommande.)

### Correctif execute (suite 21) — M115 frontieres (shared)+inventory
- **M115 / DEBT-022** — `error.tsx` + `loading.tsx` ajoutes aux groupes `(shared)` (fil-actualite/annonces) et `inventory` (app mobile POS), completant `(dashboard)`/`(employee)`. Les 4 groupes utilisateur ont desormais une frontiere d'erreur (retry) + un etat de chargement (spinner). Inventory : variante full-screen tactile. tsc 0, lint 0 sur les 4 fichiers, jest 118. Pure addition front. Reste optionnel : conversion RSC (refactor separe).

### Correctif execute (suite 22) — M142 cosmetique (no-unescaped-entities)
- **M142 / DEBT-032** — react/no-unescaped-entities (9) corrige : apostrophes JSX (aujourd'hui, l'analyse, d'inventaire) echappees en &apos; et guillemets JSX ("{exchange.message}") en &quot;. Rendu identique, zero runtime. Categorie lint a 0 (total eslint 94 -> 85). tsc 0, jest 118. Reste lint runtime-sensible laisse delibere : any (39), set-state-in-effect (30), no-img-element (8), hooks (3).

### Correctif execute (suite 23) — M116 tests utilitaires purs
- **M116 / DEBT-023** — `src/__tests__/pure-utils.test.ts` (13 tests) : `geo` (haversineDistance + isWithinRadius = validation rayon pointage GPS, M005), `shift-utils` (doTimesOverlap : overlap/adjacent/dates/self-id ; calculateShiftHours), `timeline-utils` (timeToMinutes/minutesToTime roundtrip, snapMinutes, clampMinutes). Suite jest 118 -> 131. tsc 0. `deriveProfileCategory` (reliability-score) non teste : pur mais co-localise avec Prisma (import.meta incompatible jest) -> extraction necessaire (note dette).

### Correctif execute (suite 24) — M141 logger conditionne (phase 1 : lib)
- **M141 / DEBT-031** — `src/lib/logger.ts` cree : `error`/`warn` toujours emis (les blocs catch prod gardent leur observabilite), `info`/`debug` uniquement hors production (ou `LOG_LEVEL=debug`) -> supprime le bruit de logs en prod sans perdre les vrais incidents. Aucune dependance (pas de risque d'import circulaire).
- Phase 1 : 16 fichiers `src/lib/**` migres (37 `console.*` -> `logger.*`), import injecte avant le premier import (insertion sure ; 1ere tentative cassait les imports multi-lignes -> revert + correction). `console.log`->`logger.debug` (dev-only), `console.error/warn` conserves en prod.
- Verifie : tsc 0, jest 131, 0 `console.*` restant dans `src/lib`. (Les 2 erreurs eslint `any` de gemini-client sont pre-existantes, dette M142.) Reste phase 2 : API (207) + composants (24).

### Correctif execute (suite 25) — M141 logger (phase 2 : API + composants) — CLOS
- **M141 / DEBT-031** — Phase 2 : 118 fichiers `src/app/**` + `src/components/**` migres (console.* -> logger.*, import injecte avant le 1er import). Avec la phase 1 (lib, 16 fichiers), **tout le codebase est migre** : 0 `console.*` restant hors `logger.ts`. Les 187 `console.error` (blocs catch) -> `logger.error` = comportement identique en prod ; les `console.log` -> `logger.debug` = supprimes en prod (bruit). Verifie : tsc 0, jest 131, eslint inchange (85, aucun import logger inutilise). M141 CLOS.

### Correctif execute (suite 26) — M114 prepare (relations FK) + finding PosTimeClock
- **M114 / DEBT-021** — Audit reel des 4 modeles a FK `String` sans relation. **Finding important** : `PosTimeClock` doit etre EXCLU (l'audit initial le listait naivement) — ses `employeeId`/`storeId` viennent d'un import POS qui peut referencer une entite TimeWin pas encore synchronisee ; le webhook logge sans bloquer. Une FK stricte rejetterait ces imports -> perte de resilience. Relation-absence intentionnelle.
- Les 3 modeles internes (`ShiftExchange`, `ReplacementOffer`, `ShiftMarketListing`) : plan complet prepare dans `docs/M114-FK-RELATIONS-PLAN.md` — schema cible (relations + champs inverses, noms explicites pour eviter collisions), politiques `onDelete` alignees M111 (Restrict sur Employee/Store, Cascade sur Shift dependant, SetNull sur nullables), SQL de detection d'orphelins (lecture seule) + migration auto-reparatrice (NULL pour nullables, DELETE des lignes deja cassees pour non-nullables).
- **Non applique** : pas d'acces DB pour le pre-vol orphelins ; ce repo deploie via `db push` -> appliquer a l'aveugle casserait le deploiement si orphelins. Prepare = ce qui peut l'etre sans risque. Action restante = ops (pre-vol + apply). Aucune verif tsc/jest (doc seul, pas de code).

### Correctif execute (suite 27) — M116 contraintes dures solveur
- **M116 / DEBT-023** — `src/__tests__/solver-constraints.test.ts` (19 tests). Couvre `constraints.ts` (pur, types-only) = les regles legales/metier du solveur : `isNoOverlap` (double-booking existant+genere, adjacence, autre employe/date), `isAvailable` (FIXED jour entier/partiel, VARIABLE par date), `isUnderDailyMax`/`isUnderWeeklyMax`, `hasEnoughRest` (repos 11h FR : gap inter-jours + gap inverse meme jour). Suite jest 131 -> 150. tsc 0.

### Correctif execute (suite 28) — M116 scoring solveur
- **M116 / DEBT-023** — `src/__tests__/solver-scoring.test.ts` (18 tests) sur `scoring.ts` (pur) : scorePriority, scorePreferredStore, scoreCostEfficiency (normalisation min/max), scoreContractualTarget (sous/au-dessus objectif), scoreFairDistribution (equite), scoreReliabilityMatch + scoreStoreImportanceMatch (Manager Brain). 1 fixture corrigee en cours (mon attendu 34+8=42 etait au-dessus de l'objectif 35 -> branche over=0.8, pas under=1 ; code correct). Suite jest 150 -> 168. tsc 0.

### Correctif execute (suite 29) — M116 contraintes solveur (complet)
- **M116 / DEBT-023** — Ajout des 5 contraintes restantes a `solver-constraints.test.ts` (+19 tests) : `isShiftPreferenceCompatible` (MATIN/AM vs milieu magasin), `isStoreOverlapCompliant` (relais/tolerance overlap, ignore self), `isUnderMaxDistinctEmployees`, `isUnderMaxSimultaneous` (sweep-line, relais exact = 1), `isProfileSafeForSlot` (Manager Brain : profil C jamais seul ouverture/fermeture/critique/entre-C). **constraints.ts = 100% des fonctions exportees couvertes.** Suite jest 168 -> 187. tsc 0.

### Correctif execute (suite 30) — M116/M010 tests generateur ZPL
- **M116 / M010** — `src/__tests__/labels-zpl.test.ts` (12 tests) sur `zpl-generator.ts` (pur) : 1 etiquette/quantite, conversion mm->dots (x8 @203DPI), defauts 58x40, prix `.toFixed(2) EUR` + ancien prix, code-barres EAN13(^BEN)/EAN8(^B8N)/CODE128(^BCN), echappement ZPL (^ et ~ strippes), troncature nom a 30 char, nom magasin, bloc ^XA..^XZ. Suite jest 187 -> 199. tsc 0. M010 (etiquettes) avait zero test.

### Correctif execute (suite 31) — M116 schemas de validation (Zod)
- **M116 / DEBT-023** — `src/__tests__/validations.test.ts` (22 tests) sur `validations.ts` (pur) = la frontiere de validation de CHAQUE ecriture API : storeCreateSchema (nom requis, bornes lat/lng, maxOverlap, emptyToNull, defauts), employeeCreateSchema (email, password>=8, priorite 1-3, defauts), shiftCreateSchema (regex HH:mm + refine fin>debut), unavailabilityCreateSchema (enum type, dayOfWeek 0-6), autoGenerateSchema (mode/duree/defauts), productCreateSchema (prix>=0, source enum). Suite jest 199 -> 221. tsc 0.
- **Bilan couverture session** : suite 95 -> 221 (+126 tests) : RBAC, cout employeur+Decimal, geo/shift/timeline, solveur contraintes (38) + scoring (18), ZPL etiquettes, schemas Zod. M116/DEBT-023 (zero test solver/RBAC/cout) substantiellement resolu.

### Correctif execute (suite 32) — M116 utilitaires transverses (dates planning)
- **M116 / DEBT-023** — `src/__tests__/utils.test.ts` (9 tests) sur `utils.ts` : `cn` (merge Tailwind, conflits px-2/px-4), `toUTCDate`/`formatDate` (surete timezone — minuit UTC, pas de decalage Paris), `getWeekBounds` (invariant : weekStart toujours lundi UTC ; weekEnd = +6j fin de journee ; dimanche rattache a la semaine precedente), `getWeekDays` (7 jours consecutifs), `getDayNameFr` (0=Lun..6=Dim, hors-borne ''). 1 fixture corrigee (weekEnd a 23:59:59 -> diff ~6.9999j, Math.floor). Suite jest 221 -> 230. tsc 0.

### Bilan M116 (DEBT-023 resolu) — couverture de tests
- Suite 95 -> 230 (+135 tests cette session) sur toute la logique pure/metier tractable : solveur (constraints 38 + scoring 18), validations Zod (22), utils dates (9), ZPL etiquettes (12), RBAC (16), cout employeur (7), geo/shift/timeline (13).
- **Exclusion deliberee** : `scenario-scoring.scoreScenario` (blend pondere de 7 sous-scores sur un `SolverResult` complet) et `suggestions.generateCrossStoreSuggestions` — testables mais fixtures lourdes + assertions fragiles (rejouent le modele de scoring) = ROI negatif, risque de casse au moindre refactor legitime. Decision pro : ne pas gonfler avec des tests cassants. DEBT-023 considere resolu.

### Correctif execute (suite 33) — M142 reduction `any` (inference)
- **M142 / DEBT-032** — Retire `: any` des callbacks `.map/.filter/.flatMap` de resultats Prisma (market-listings, messages, costs, integrations/pos) : l'inference fournit les vrais types (les `as string` deja presents garantissent la compat). 8 directives `eslint-disable no-explicit-any` orphelines retirees. `any` 39->29, total eslint 85->72. tsc 0, jest 230.
- **Decision** : `where: any` (constructeurs de filtre Prisma dynamiques) laisses tels quels — les typer en `Prisma.XWhereInput` revele surtout des assignations string->enum (params de requete) necessitant des casts par site, valeur faible / churn reel. Pattern intentionnel (commentaires eslint-disable conserves la ou l'any subsiste).

### Correctif execute (suite 34) — M142 retrait `(prisma as any)` (drift)
- **M142 / DEBT-032** — `pos-feed/store-schedules/route.ts` : 3 casts `(prisma as any).storeSchedule`/`.$transaction` retires. Diagnostic : `prisma.storeSchedule` typecheck SANS cast (utilise non-caste dans stores/[id]/schedules, alerts.ts, shifts.ts) -> le cast etait un artefact inutile qui SUPPRIMAIT le type-checking sur les args findMany/upsert (risque de bug masque). Retrait = type-safety restauree. tsc 0, jest 230.

### Correctif execute (suite 35) — hygiene build Next 16 (viewport metadata)
- **Build hygiene** — `src/app/inventory/layout.tsx` : `viewport` deplace de l'export `metadata` (deprecie Next 16) vers l'export dedie `export const viewport: Viewport`. Emet le MEME `<meta name="viewport">` (rendu identique) -> resout les 5 warnings build « Unsupported metadata viewport » (/inventory/counts,history,home,login,scan, qui heritent de ce layout). Root layout deja conforme (themeColor dans viewport export). tsc 0, jest 230. Verifiable : warnings absents au prochain build Vercel.

### Correctif execute (suite 36) — M116 tests frontiere Decimal + HMAC POS
- **M116 / M101 / M008** — `decimal.test.ts` (6 tests) : `toNum`/`toNumN` (passthrough number, conversion Decimal-like via .toNumber(), pieges falsy 0, null/undefined->null). C'est la frontiere qui sous-tend tout le travail money M101/M101b. `hmac.test.ts` (8 tests) : `computeHmac` (deterministe, SHA-256 hex, sensible a chaque composant) + `validateHmac` (en-tetes manquants, timestamp NaN, drift >5min, signature valide, anti-rejeu nonce, mauvaise signature, mauvais secret) = auth du webhook POS. Suite 230 -> 244. tsc 0.
- Amelioration au passage : `hmac.ts` setInterval de cleanup des nonces passe en `.unref()` -> ne bloque plus la sortie du process (tests/CLI). Comportement runtime inchange.

### Correctif execute (suite 37) — M116 tests cost-mappers (serialisation money)
- **M116 / M101** — `cost-mappers.test.ts` (7 tests) : `countryRulesFromConfig` (Decimal->number + passthrough number + champs non-money preserves), `serializeCountryConfig` (coerce les Decimal presents, ignore les cles absentes [select partiel], preserve null), `serializeEmployeeCost` (hourlyRateGross/overrides nullable + recursion dans `country`). Frontiere de serialisation API du module cout. Suite 244 -> 251. tsc 0.

### Correctif execute (suite 38) — M116 tests securite upload (magic bytes)
- **M116 / M011 / securite** — `detectMimeFromBytes` + `mimeToExt` exportes (etaient prives) pour verrouiller le controle anti-fichier-deguise (le type reel vient des magic bytes, pas du Content-Type declare). `uploads.test.ts` (10 tests) : JPEG/PNG/PDF/MP4(ftyp@4)/WebP reconnus, buffer trop court -> null, en-tete EXE/PE -> null (rejet), mimeToExt connus/inconnus. Suite 251 -> 261. tsc 0. Export = changement sur, reversible.

### Correctif execute (suite 39) — M116 tests JWT inventaire (anti-forge)
- **M116 / M009 / M103** — `inventory-jwt.test.ts` (5 tests, jose charge OK dans jest) : sign->verify round-trip (payload restitue), rejet sans en-tete Authorization, rejet schema non-Bearer, rejet token falsifie, **rejet token signe avec un autre secret (anti-forge)**. Verrouille la correction M103 (suppression du fallback secret en dur). Suite 261 -> 266. tsc 0.
- **Bilan couverture (reprise)** : suite 95 -> 266 (+171). Frontiere money (decimal, cost-mappers, employer-cost), securite (hmac POS, upload magic-bytes, JWT inventaire), solveur (constraints+scoring), validations Zod, utils dates, RBAC, labels ZPL.

### Correctif execute (suite 40) — M116 tests timeline (lanes/couverture)
- **M116 / M004** — `timeline-lanes.test.ts` (9 tests) sur les fns pures restantes de `timeline-utils` : `assignLanes` (packing d'intervalles : vide, non-chevauchants meme lane, chevauchants lanes 0/1, reutilisation de lane liberee), `calculateCoverage` (heures couvertes bornes exclusives, shifts simultanes additionnes), `getEmployeeColor` (non-assigne fixe, deterministe par id, palette de classes). Suite 266 -> 275. tsc 0.

### Correctif execute (suite 41) — M116 tests detection violations timeline
- **M116 / M004** — `timeline-violations.test.ts` (10 tests) sur `detectShiftViolations`, derniere fn pure non couverte de `timeline-utils` : pas d'horaire -> [], magasin ferme -> `store_closed` (court-circuite les autres regles), shift dans/hors horaires (debut avant ouverture, fin apres fermeture -> `outside_hours`), `max_employees` avec ratio `n/max` (et exclusion des shifts non assignes), `max_simultaneous` via sweep-line (pic de chevauchement > seuil, vs enchainement sans chevauchement), cumul de violations. Suite 275 -> 285. tsc 0.
- **Bilan couverture** : la surface pure testable de `timeline-utils` est desormais entierement couverte (lanes + couverture + couleur + violations). Suite 95 -> 285 (+190) sur la reprise.

### Correctif execute (suite 42) — M116 tests money-serialize + rate-limit
- **M116 / M101b** — `money-serialize.test.ts` (9 tests) : `serializeProduct` (price/oldPrice/vatRate Decimal->number, preserve null, n'invente pas les cles absentes [select partiel], idempotent sur number), `serializeStoreVat` (coerce vatRate, court-circuit meme-reference si absent, preserve null), `serializeLabelJob` (priceAtPrint de chaque item + recursion dans product, court-circuit si items non-tableau). Frontiere de serialisation API qui empeche NextResponse.json() de renvoyer des Decimal en string.
- **M116 / securite** — `rate-limit.test.ts` (7 tests) : `checkRateLimit` (autorise + decremente remaining, bloque au-dela avec retryAfterMs borne, isolation entre cles, reouverture de fenetre apres resetAt via fake timers), `getClientIp` (1re IP de x-forwarded-for, fallback x-real-ip, 'unknown'). Anti brute-force login / protection routes.
- Amelioration au passage : `rate-limit.ts` setInterval de cleanup passe en `.unref()` (ne bloque plus la sortie process, comme hmac). Runtime inchange.
- Suite 285 -> 301 (+16). tsc 0.

### Correctif execute (suite 43) — M116 tests parser NLP Manager IA
- **M116 / Manager IA (couche 1)** — `manager-ia-parser.test.ts` (27 tests) sur le parser NLP francais 100% deterministe (rule-based, sans LLM) : `fuzzyMatch` (exact insensible casse/accents, tolerance Levenshtein, seuil, prefixe), `extractEmployeeName` (prenom, nom complet flou, filtre mots communs), `extractStoreName` (inclusion directe, absence), `extractDateExpr` (mots-cles relatifs today/tomorrow, jours de semaine weekday:N, date explicite day:N), `extractTargetDateExpr` (destination MOVE), `extractTimeSlot` (plage 'de 9h a 17h', 'jusqu'a', 'a partir de', creneaux nommes), `extractDuration` ('2h30'->150, '30 min', '1 heure'->60), `parseCommand` (intent complet CREATE, DELETE, MOVE source!=destination). Verrouille l'extraction d'intention des commandes en langage naturel. Suite 301 -> 328 (+27). tsc 0.

### Correctif execute (suite 44) — M116 tests AI Engine (fraud-scorer + nlp-confidence)
- **M116 / AI Engine anomaly** — `fraud-scorer.test.ts` (7 tests) sur `calculateFraudScores` : agregation des anomalies en fraud_risk_score 0-100 par employe. Couvre vide->[], skip anomalies sans employeeId, score unitaire (poids x severite x log2(count+1) ; GHOST_SHIFT HIGH=38), rendements decroissants (3x REVENUE_DROP->log2(4)=2), severite max retenue par type (LOW+CRITICAL->mult 2), plafond 100, tri employes/breakdown par contribution decroissante.
- **M116 / AI Engine NLP** — `nlp-confidence.test.ts` (8 tests) sur `scoreConfidence` : score 0-1 qui conditionne le fallback Gemini. Couvre CREATE complet reconnu (haute conf, 0 motif), ANALYZE sans exigences (~0.99), CREATE sans employe (entityConfidence 0.3 + motif), employe/magasin non reconnu (0.5/0.6), date requise manquante (0.4), creneau nomme sans heure (timeConfidence 0.8), horaire totalement absent (0.5).
- Suite 328 -> 343 (+15). tsc 0.

### Correctif execute (suite 45) — M116 tests scenario-scoring (notation holistique solveur)
- **M116 / M002 (solveur)** — `scenario-scoring.test.ts` (7 tests) sur `scoreScenario` : notation d'un scenario complet de planning sur 7 dimensions ponderees (couverture 25, duree 15, equilibre 15, contraintes 10, cout 10, pauses 5, placement profils 20). Couvre la baseline vide deterministe (breakdown exact -> total 78 'Bon'), le scenario parfait (100 'Excellent'), penalite warnings (constraintRespect 87), breakQuality (shift long sans/avec pause = 0/100), couverture (-10 par shift non assigne), interpolation duree au-dessus de l'ideal (8h->80), placement profils A vs C en OUVERTURE (60->combine 80). Fixtures completes SolverResult/SolverInput/GeneratedShift. Suite 343 -> 350 (+7). tsc 0.
- **Bilan couverture (etendu)** : la quasi-totalite des modules purs a forte logique metier est desormais couverte — money (decimal, cost-mappers, money-serialize, employer-cost), securite (hmac, uploads, inventory-jwt, rate-limit), solveur (constraints, scoring, scenario-scoring), NLP/IA (parser manager-ia, nlp-confidence, fraud-scorer), timeline (lanes, violations), validations, utils, rbac, labels ZPL. Suite 95 -> 350 (+255) sur la reprise.

### Correctif execute (suite 46) — M116 tests suggestions inter-magasins
- **M116 / M002 (solveur)** — `cross-store-suggestions.test.ts` (7 tests) sur `generateCrossStoreSuggestions` : pour chaque shift non assigne, proposer un employe d'un AUTRE magasin capable de couvrir le creneau. Couvre <2 magasins->[], aucun shift non assigne->[], proposition valide (MOVE_EMPLOYEE from B to A), rejet employe non autorise sur le magasin cible, rejet plafond hebdomadaire (maxHoursPerWeek), rejet indisponibilite FIXE chevauchante, rejet conflit avec son propre shift le meme jour. S'appuie sur les contraintes pures deja testees (overlap/simultaneite/distinct). Suite 350 -> 357 (+7). tsc 0.

### Correctif execute (suite 47) — M116 patron mock Prisma + deriveProfileCategory
- **M116 / Manager Brain** — `reliability-profile.test.ts` (4 tests) sur `deriveProfileCategory` (logique pure co-localisee avec un module DB-bound) : seuils A>=75 / B 50-74 / C<50, bornes exactes. Pilote le placement des profils (A ouvre seul / magasins difficiles, C jamais seul sur creneau sensible). Etablit le **patron `jest.mock("@/lib/prisma")`** qui permet de charger un module important le singleton Prisma sans connexion DB — reutilisable pour etendre la couverture aux modules DB-bound. Suite 357 -> 361 (+4). tsc 0.

### Correctif execute (suite 48) — hygiene lint : directives eslint-disable orphelines
- **DEBT / hygiene** — retrait de 2 directives `eslint-disable-next-line` mortes (signalees par eslint comme « Unused eslint-disable directive », ne supprimant plus aucun warning) : `api/employees/[id]/route.ts:56` (`no-unused-vars` ; `storeIds` est utilise L80+, `_password`/`_role` ignores par underscore) et `components/planning/shift-modal.tsx:351` (`react-hooks/exhaustive-deps` ; la regle ne se declenche plus sur ce useEffect). eslint 0 sur les 2 fichiers, tsc 0, jest 361. Reduit le bruit lint sans changer le comportement.

### Correctif execute (suite 49) — DEBT-032 retrait de casts `as any` type-honnetes
- **DEBT-032 / type-safety** — 6 casts `as any` remplaces par des types precis (tsc 0) :
  - `notifications/logs/route.ts` (3) + `messages/route.ts` (2) : `X.includes(v as any)` -> `(X as readonly string[]).includes(v)`. Le `as any` masquait le rejet d'un `string` par le type tuple littéral (`as const`) ; le widening en `readonly string[]` est honnête (test d'appartenance runtime) et conserve le type-checking sur `v`.
  - `api-helpers.ts:29` : `(session.user as any).mustChangePassword` -> `(session.user as { mustChangePassword?: boolean })`. Acces de propriete type precis.
  - Laisse : `api-helpers.ts:69` `serviceSession as any` (cast structurel de Session construite — plus risque, hors scope sur). `any` 26 -> 20. tsc 0, jest 361.

### Correctif execute (suite 50) — DEBT-032 (suite) retrait casts `as any`
- **DEBT-032 / type-safety** — 4 casts `as any` supplementaires remplaces (tsc 0, eslint 0) :
  - `absences/route.ts:144` : `VALID_STATUSES.includes(status as any)` -> `(... as readonly string[]).includes(status)`.
  - `integrations/pos/[id]/route.ts` (2) + `integrations/pos/route.ts` (1) : strip des champs sensibles `const {apiKey,apiSecret,accessToken,refreshToken,...safe} = provider as any` -> `as Record<string, unknown>`. Plus honnete (pas de propagation d'acces `any`), runtime identique, le spread `...safe` typecheck toujours (ignoreRestSiblings sur les secrets extraits). Securite inchangee (memes champs retires).
  - Laisses : `dashboard/route.ts:136` (`where ... as any` — pattern prisma-where dynamique documente), `costs/page.tsx` useState<any[]> (etat UI, typage churny). `any` 20 -> 16. tsc 0, jest 361.

### Correctif execute (suite 51) — DEBT-032 (fin) cast role-access
- **DEBT-032 / type-safety** — `annonces/page.tsx:52` : `(session?.user as any)?.role` -> `(session?.user as { role?: string } | undefined)?.role` (meme patron type-honnete que api-helpers). `any` 16 -> 15. tsc 0, jest 361.
- **Cloture du chantier `no-explicit-any` (DEBT-032)** : 39 -> 15 sur la reprise. Les 15 restants sont intentionnels/hors-scope-sur : casts SDK Gemini (`embedContent({...outputDimensionality} as any)` — champ absent du type SDK), `where ... as any` (filtres Prisma dynamiques documentes), assignations string->enum Prisma (churny, faible valeur), `useState<any[]>` d'etat UI (typage downstream lourd), et scripts de dev (hash-pins, setup-pos-integration).

### Correctif execute (suite 52) — M116 tests moteur de remplacement (DB-bound via mock Prisma)
- **M116 / M013** — `replacement-candidates.test.ts` (8 tests) sur `findEligibleCandidates` (1re fonction DB-bound testee via le patron `jest.mock("@/lib/prisma")` etabli suite 47). Mock de `storeEmployee.findMany`, le reste du filtrage/tri est en memoire via helpers purs deja testes. Couvre : candidat eligible (hoursRemaining = contrat - heures), exclusion inactif / employe absent / indispo FIXE chevauchante / shift chevauchant le meme jour / depassement plafond hebdo, tri par priorite puis heures restantes decroissantes, ciblage du bon magasin (where storeId). Suite 361 -> 369 (+8). tsc 0.
- **Ouverture du chantier tests DB-bound** : le patron de mock Prisma permet desormais d'unit-tester la logique de selection/filtrage co-localisee avec la DB sans connexion reelle.

### Correctif execute (suite 53) — M116 tests detecteur d'alertes analytics (DB-bound)
- **M116 / analytics** — `alerts-detector.test.ts` (6 tests) sur `detectAlerts` via mock Prisma (3 requetes : daily + 2x scores). Couvre les 5 regles de seuil : vide->[], regle 1 CA/h < 50% moyenne magasin -> low_revenue critical (isolation low vs high), regle 3 upsell < 1.2 -> no_upsell (employe seul pour neutraliser les auto-comparaisons 1/2), regle 4 part especes > 70% -> cash_anomaly, regle 5 chute de score > 30% vs periode precedente -> performance_drop, propagation du filtre storeId. Frontiere money via toNum. Suite 369 -> 375 (+6). tsc 0.

### Correctif execute (suite 54) — M116 tests fabrique d'adaptateur POS
- **M116 / POS** — `pos-factory.test.ts` (3 tests) sur `createPosAdapter` : type CUSTOM_API -> MockPosAdapter initialise (config renseignee -> testConnection true, aucun warning), type inconnu (LIGHTSPEED) -> fallback Mock + 1 warning logger contenant le type, nouvelle instance a chaque appel. Verrouille la resilience dev de la fabrique POS et le contrat d'initialisation. Suite 375 -> 378 (+3). tsc 0.

### Correctif execute (suite 55) — M116 tests journal d'audit (resilience)
- **M116 / audit** — `audit.test.ts` (4 tests) sur `logAudit` (mock Prisma + logger) : ecriture avec diff serialise (JSON.stringify), diff null si absent, **saut de l'ecriture DB pour les cles de service** (`service:*` -> evite la violation FK User, log debug), **avalement des erreurs DB sans jamais throw** (resilience : l'audit ne doit jamais casser l'operation principale, log error). Suite 378 -> 382 (+4). tsc 0.

### Correctif execute (suite 56) — M116 tests catalogue d'evenements de notification
- **M116 / notifications** — `notification-events.test.ts` (21 tests, parametres sur les 9 evenements) sur `EVENT_CONFIG` : invariants par evenement (priorite valide, titre non vide, bodyTemplate/urlBuilder sont des fonctions, au moins un canal actif), robustesse des templates avec contexte vide (jamais de throw, url commence par "/"), injection des valeurs de contexte dans le corps, et **les evenements CRITICAL activent le SMS**. La completude vis-a-vis de l'enum Prisma NotificationEventType est deja garantie par tsc (type Record). Suite 382 -> 403 (+21). tsc 0.
- **Bilan reprise (tests)** : suite 275 -> 403 (+128) ; pures (timeline, money-serialize, rate-limit, parser NLP, fraud-scorer, nlp-confidence, scenario-scoring, suggestions, profil) + DB-bound via mock Prisma (replacement, alerts-detector, pos-factory, audit, events).

### Correctif execute (suite 57) — M116 tests score de fiabilite (Manager Brain core)
- **M116 / Manager Brain** — `reliability-score.test.ts` (5 tests) sur `calculateReliabilityScore` (340 lignes, 8 lectures Prisma batchees dans un Promise.all, toutes mockees). Assertions disciplinees (coarse pour la robustesse, exactes la ou c'est isole) : sans donnee -> score borne [0,100] non-NaN + chaque dimension dans sa borne documentee (20/20/15/10/10/10/10/5) + coherence profileCategory/deriveProfileCategory ; ponctualite parfaite -> 20/20 ; un retard >30min -> penalite 3 -> 17/20 ; penalites graduees (<=10min=1, <=30=2) ; batch filtre sur le bon employeeId. Suite 403 -> 408 (+5). tsc 0.

### Correctif execute (suite 58) — M116 tests orchestration des offres de remplacement
- **M116 / M013** — `replacement-offers.test.ts` (4 tests) sur `createReplacementOffers` (entree du flux de remplacement, mock Prisma : shift.findMany/update, replacementOffer.create, storeEmployee.findMany via findEligibleCandidates). Couvre : aucun shift -> 0 offre + aucune ecriture, shift futur avec candidat -> desassignation (employeeId null) + creation de l'offre (candidats inclus), shift deja expire -> desassigne mais pas d'offre (expiresAt <= now), shift futur sans candidat -> desassigne mais pas d'offre. Complete la couverture du moteur de remplacement (findEligibleCandidates en suite 52). Suite 408 -> 412 (+4). tsc 0.
- **Bilan reprise (tests)** : suite 275 -> 412 (+137). DB-bound couverts via mock Prisma : replacement (candidats + offres), alerts-detector, audit, notifications/events, reliability-score (Manager Brain core), pos-factory.

### Correctif execute (suite 59) — M116 tests routage de canaux (dispatcher)
- **M116 / notifications** — `resolveChannels` exporte (patron de test, precedent uploads.detectMimeFromBytes) ; `dispatcher-channels.test.ts` (7 tests) sur le routage des canaux : NORMAL+defauts -> PUSH+EMAIL, LOW -> pas d'email (reserve NORMAL+), CRITICAL force PUSH+EMAIL+SMS meme defauts off, les preferences utilisateur ecrasent les defauts, IMPORTANT+opt-in SMS -> EMAIL+SMS (push non force), email/sms non configures -> canal supprime meme en CRITICAL. I/O isolees (prisma/push/email/sms/logger mockes ; isEmailConfigured/isSmsConfigured pilotables). Suite 412 -> 419 (+7). tsc 0, eslint 0.

### Correctif execute (suite 60) — M116 tests alerte "magasin non ouvert"
- **M116 / alertes manager** — `parseTime` + `detectStoreNotOpened` exportes (patron de test) ; `alerts-store-not-opened.test.ts` (5 tests). `parseTime` (HH:mm -> minutes). `detectStoreNotOpened` via mock Prisma (storeSchedule.findMany + clockIn.findFirst) et **horloge figee (fake timers a 12:00 UTC)** pour deterministe : magasin ouvert sans pointage -> alerte CRITICAL, magasin avec pointage -> rien, ouverture encore a venir (< openTime+15) -> ignore sans requete pointage, aucun horaire -> []. Suite 419 -> 424 (+5). tsc 0, eslint 0.

### Correctif execute (suite 61) — M116 tests alerte "retard significatif"
- **M116 / alertes manager** — `detectSignificantLateness` exporte ; `alerts-lateness.test.ts` (5 tests, mock clockIn.findMany) : aucun retard -> [], retard <=30min -> WARNING, retard >30min -> CRITICAL (seuil de severite), mapping titre/heure (derivee de clockInAt)/contextKey/details, filtre de requete (status LATE, lateMinutes>15). Suite 424 -> 429 (+5). tsc 0, eslint 0.

### Correctif execute (suite 62) — M116 tests contraintes de reclamation marketplace
- **M116 / marketplace** — `marketplace-claim.test.ts` (7 tests) sur `checkClaimConstraints` (mock prisma.employee.findUnique + ./shifts findOverlappingShift/calculateWeeklyHours). Verifie chaque contrainte dure de reclamation d'un shift : employe introuvable -> tout en echec, toutes contraintes OK -> eligible (+ details), plafond hebdo depasse, chevauchement, indispo FIXE, plafond journalier, repos insuffisant (< 11h). Chaque cas isole une seule contrainte en echec. Suite 429 -> 436 (+7). tsc 0.

### Correctif execute (suite 63) — M116 tests helpers shifts (chevauchement / heures hebdo)
- **M116 / shifts** — `shifts-helpers.test.ts` (6 tests, mock shift.findMany) sur les helpers fondamentaux reutilises partout (replacement, marketplace, solveur) : `findOverlappingShift` (employe non assigne -> null sans requete, retourne le shift chevauchant, aucun chevauchement -> null) et `calculateWeeklyHours` (non assigne -> 0 sans requete, somme des heures de la semaine, vide -> 0). Suite 436 -> 442 (+6). tsc 0.

### Correctif execute (suite 64) — correctness : le test de hash garde le vrai code
- **M116 / notifications** — `planning-snapshot-hash.test.ts` importait une RE-IMPLEMENTATION locale de `computeShiftSnapshotHash` (commentaire « mirrored from notify/route.ts ») : le test ne gardait donc pas le code de production -> une divergence ne serait pas detectee. Corrige : import de la VRAIE fonction depuis `@/lib/notifications/planning-hash`. Verifie : `notify/route.ts` importe deja la fonction canonique (pas de duplication). 7 tests toujours verts, ils garantissent desormais reellement l'invariant « meme planning -> meme hash » (anti-faux-positif « planning modifie apres envoi »). tsc 0.

### Correctif execute (suite 65) — M116 tests sync pointages POS (idempotence + classification)
- **M116 / POS / regle TimeWin24 "no duplicate events"** — `syncTimeClocks` exporte ; `pos-sync-timeclocks.test.ts` (7 tests, mock adapter.fetchTimeClocks + prisma.shift.findFirst/posTimeClock.upsert). Verrouille les deux invariants metier : **idempotence** (l'upsert utilise la cle `providerId_posRecordId` -> jamais de doublon de pointage), et **classification du delta vs planning** (on_time <=5min, late >5min, early, extra si pas de shift). Couvre aussi : entree non mappee -> skip sans upsert, calcul workedHours (clockOut-clockIn-pause), resolution posStoreId/posEmployeeId -> ids TimeWin. Suite 442 -> 449 (+7). tsc 0.
- **Bilan reprise (tests)** : suite 275 -> 449 (+174). Couverture pure + DB-bound (mock Prisma) sur replacement, alerts (detector + 2 detecteurs), audit, notifications (events/dispatcher/hash), reliability-score, marketplace, shifts, pos (factory + sync pointages idempotent), solveur (constraints/scoring/scenario/suggestions), NLP/IA.

### Correctif execute (suite 66) — M116 tests sync ventes POS (idempotence)
- **M116 / POS / regle TimeWin24 "no duplicate events"** — `syncSales` exporte ; `pos-sync-sales.test.ts` (4 tests, mock adapter.fetchSales + prisma.posSalesData.upsert) : magasin non mappe -> skip sans upsert, **upsert idempotent sur `providerId_storeId_date_hourSlot`** (anti-doublon de vente horaire), renseignement CA/transactions/articles, comptage + success. Complete la couverture d'idempotence du sync-engine (pointages en suite 65). Suite 449 -> 453 (+4). tsc 0.
- **Note infra** : Vercel free-tier a atteint la limite de 100 deploiements/jour (3 projets x nombreux pushes). Non bloquant pour le code (git push OK, tests locaux via jest). Les previews se debloquent sous 24h ou via upgrade Pro. Pushes desormais regroupes pour limiter la conso de quota.

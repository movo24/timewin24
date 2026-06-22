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

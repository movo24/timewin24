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
Validation : ⛔/⚠️ **argent stocké en `Float`** (M101, P1) — bloqué sur décision "données prod ?".

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

#### M101 — Argent `Float` → `Decimal`
Statut : ⛔ Bloqué (décision métier) · Priorité : P1 · Module : M007
Dépendances : réponse à « la prod a-t-elle déjà des données monétaires ? ».
Scope : `EmployeeCost`, `CountryConfig`, `PosSalesData`, `Product.price/oldPrice/vatRate`, `EmployeePerformanceDaily`, `Store.vatRate` → `Decimal @db.Decimal(12,2)` / `(6,4)`.
Si pas de données prod = migration additive (fenêtre idéale). Sinon = migration + backfill non-additive à scoper.
Critères : aucune dérive d'arrondi ; tests calcul coût employeur.

#### M110 — `employees/[id]/access` : store-scoping manager
Statut : ✅ Fait (store-scoping) · Priorité : P1 · Module : M003
Scope : un MANAGER ne gère l'accès que des employés de ses magasins (`getAccessibleStoreIds`).
Validation : ✅ check `storeEmployee` ajouté (non-admin → 403 hors périmètre) ; tsc/lint/jest OK ; runtime ⚠️ non vérifié.
Reste (⬜) : interdire d'agir sur une cible de rôle ≥ (employé lié à un user ADMIN).

#### M104 — PIN/code en CSPRNG
Statut : ✅ Fait · Priorité : P1 · Fichier : `employees/[id]/access/route.ts`
Validation : ✅ `Math.random` → `crypto.randomInt` ; tsc/lint OK.

#### M111 — Cascades de suppression destructrices
Statut : ⬜ À faire · Priorité : P1 · Module : M002
Scope : soft-delete `Store`/`Employee`/`User` ; `ClockIn`/`Shift`/`AbsenceDeclaration`/`EmployeeCost` Cascade → `Restrict`/`SetNull` + snapshot.
Note : migration de schéma — préparer, valider hors prod.

#### M112 — Transactions sur écritures multiples
Statut : ⬜ À faire · Priorité : P1
Scope : `planning/manager-ia` (apply plan), `shifts/duplicate`, `stores/[id]/toggle-status`, `absences/[id]` (offres hors tx).

#### M120 — Rate-limiter partagé (Redis)
Statut : ⛔ Bloqué (infra) · Priorité : P1
Dépendances : instance Redis + config. En mémoire actuellement (reset par déploiement, ×N instances, `x-forwarded-for` spoofable).

#### M105 — Fuites de message d'erreur
Statut : ✅ Fait · Priorité : P1
Validation : ✅ ai/test, ai/pos-analysis, pos-feed/store-schedules → message générique ; détail en console.

### 🟡 P2 — Features / robustesse

#### M113 — N+1 `replacement.ts`
Statut : ⬜ À faire · Priorité : P2 — calcul en mémoire (shifts déjà eager-loaded).

#### M114 — « FK » String sans relation
Statut : ⬜ À faire · Priorité : P2 — `PosTimeClock`, `ShiftExchange`, `ShiftMarketListing`, `ReplacementOffer`.

#### M115 — Frontières error/loading (front)
Statut : ⬜ À faire · Priorité : P2 — aucun `error.tsx`/`loading.tsx` ; pages read-only à passer en RSC.

#### M116 — Tests chemins critiques
Statut : 🔄 En cours · Priorité : P2
- ✅ RBAC : `src/__tests__/rbac.test.ts` (16 tests — matrice par rôle, hiérarchie, helpers, routes par défaut). Suite : 95 → 111.
- ⬜ Reste : coût employeur (`employer-cost`), couverture solver étendue.

#### M121 — `notifications/clicked` non authentifié
Statut : ⚠️ À vérifier · Priorité : P2 — write timestamp sur row arbitraire (intentionnel SW ; rate-limiter).

#### M122 — Index manquants
Statut : ⬜ À faire · Priorité : P2 — `PosTimeClock.shiftId`, `AuditLog.userId`, `ReplacementOffer.absentEmployeeId`.

#### M130 — CI GitHub Actions
Statut : ⬜ À faire · Priorité : P2 — aucun workflow ; ajouter lint+test+typecheck sur PR.

#### M131 — Deploy : `db push` → `migrate deploy`
Statut : ⬜ À faire · Priorité : P1 — `deploy.sh` utilise `prisma db push` (perte de données possible).

#### M132 — Seed durci
Statut : ⬜ À faire · Priorité : P1 — `prisma/seed.ts` mots de passe par défaut imprimés, lancé en prod par `deploy.sh`.

### 🟢 P3 — Nettoyage / doc

#### M140 — Dépendances vulnérables
Statut : ⬜ À faire · P3/P1 mixte — bump `next`/`nodemailer`.
#### M141 — `console.*` (268) → logger conditionné · P3
#### M142 — `any` (186) / lint debt (~87) · P3
#### M143 — README périmé (décrit un MVP 5 modèles vs 56) · P3
#### M144 — Hygiène repo : binaires/logs trackés (`.playwright-mcp` déjà retiré, reste `firebase-debug.log`, PNG racine) · P3

# PROJECT_STATUS — TimeWin24

> Snapshot vérifié du chantier. Source de vérité = le repo, pas l'historique de chat.
> Dernière mise à jour : 2026-07-04.

## État build / qualité (vérifié)

| Contrôle | Résultat | Méthode |
|---|---|---|
| TypeScript (`tsc --noEmit`) | ✅ 0 erreur | exécuté (après `prisma generate`) |
| Tests unitaires (`jest`) | ✅ 584/584 (61 suites) | exécuté |
| ESLint | ⚠️ ~87 erreurs repo (majorité `no-explicit-any`, `prefer-const`, unused) | exécuté ; **n'échoue pas le build** (preuve : Vercel vert) |
| Build Vercel (3 projets) | ✅ vert | API GitHub statuses sur HEAD |
| `npm audit` | 🔴 1 crit (dev), 21 high, 29 mod | dev tooling majoritaire ; runtime : `next`, `nodemailer` |
| Comportement runtime | ⚠️ **non vérifié** | pas d'accès DB/prod depuis cette session |

## Périmètre & accès (vérifié)

- Repo de travail : **`movo24/timewin24`** uniquement (scope GitHub de la session).
- Autres repos du compte : `movo24/CAISSE` (POS, privé), `movo24/movo24` (privé) — **hors scope**, non modifiables ici.
- Accès **absents** (sondés) : DB prod, Vercel/Railway env, GitHub Actions secrets, tokens plateforme, réseau sortant général (403). → toute **rotation de secret / action prod** est ⛔ côté ops.

## Branche & PR en cours

- Branche : `claude/site-wesley-folder-5kpj25`.
- **PR #6** (draft, CI verte) : runbook rotation secrets + durcissement inventory auth (C1/H1) + retrait `next-pwa` + nettoyage script POS/playwright.
- Le site **The Wesley** (e-commerce) a été ajouté puis **reverté** (mauvais repo) — préservé dans l'historique au commit `73570cc`.

## Incident sécurité ouvert (⛔ ops)

3 credentials committés (commit `6332a54`, toujours en historique) : mot de passe admin, rôle Postgres `caisse`, `POS_SECRET`. **Rotation = action ops** (hors session). Runbook prêt : `docs/SECURITY-ROTATION-RUNBOOK.md`. Séquence : rotation → purge historique → rebase #6 → re-CI → merge.

## Finalisation pilote interne (2026-07-04)

> Décision produit : **logiciel interne mono-groupe multi-magasins** (pas de SaaS
> multi-client pour l'instant). Guide de mise en pilote, checklists d'installation
> et de test, modules dormants et limites : **`docs/PILOT-READINESS.md`**.
> Cœur pilote complet ; ajout page `/organisation` (SIREN paie) ; audit renforcé
> (clés API, accès employé, absences). Modules dormants documentés (IA, solde CP).

## Audit complet + reprise sécurité (2026-07-04)

Audit lecture-seule complet réalisé, puis **6 blocs de correction** :
- **Bloc 1 (C1)** — migrations manquantes reconstruites (paie + enums POS), dérive schema↔migrations refermée ; `docs/RUNBOOK-EXPLOITATION.md` (sync DB, baseline, rollback, backup, secrets, POS).
- **Bloc 2 (C2/M1/M2)** — scoping multi-magasin sur ~15 routes manager + clé POS liée à ses magasins ; helpers `store-scope.ts`/`canAccessEmployee`/`assertPosStoreAccess` ; 28 tests d'autorisation (purs + prisma-mock + route next-auth).
- **Bloc 3 (C3)** — anti-spoofing pointage `attendance/*` (ownership + périmètre).
- **Bloc 4 (M3)** — endpoints frontend cassés restaurés (`analytics/alerts`, `labels/templates/[id]/default`).
- **Bloc 5 (M5/M6)** — identité contrat preview↔persist alignée ; sources de temps clarifiées (ClockIn autoritaire).
- **Bloc 6** — docs réconciliées (ce fichier, README, PAYROLL-MODULE, runbook).

**Décisions humaines restantes** : tenancy (mono-groupe vs SaaS multi-tenant), baseline migrations sur la prod existante (`migrate resolve`, accès DB requis), sort du moteur IA non branché, réconciliation temps POS↔app, format de mapping paie concret.

## Avancement de cette session (méthode modulaire)

- ✅ M2 — génération PIN/code en CSPRNG (`crypto.randomInt`).
- ✅ M11 — suppression des fuites de message d'erreur (ai/test, ai/pos-analysis, pos-feed/store-schedules).
- ✅ Docs de pilotage créés (ce fichier + MASTER_ROADMAP, MODULE_SPECS, TECHNICAL_DEBT, EXECUTION_LOG).

Détail des priorités et du backlog : voir `MASTER_ROADMAP.md`.

## Module Paie / DSN / Bulletins
- **Étage 2 Payroll Inputs** : moteur de qualification pur LIVRÉ (`src/lib/payroll/`, 23 tests, sans €). Frontière respectée : quantités, jamais de montants.
- **Schéma DB** : proposé (`docs/PAYROLL-MODULE.md`), exécution en attente GO Tier-2.
- **Étages 3/4/5 (Export / Payslip Vault / DSN)** : non démarrés ; squelette uniquement, dépôt DSN réel = Tier-3 (jamais l'agent).

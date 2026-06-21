# TimeWin24 — Plateforme RH & Planning multi-magasins

Application interne de gestion du personnel pour réseaux multi-boutiques : planning,
pointage, absences/remplacements, coûts employeur, intégration caisse (POS),
inventaire mobile, étiquettes, messagerie RH, analytics et moteur IA.

> **Documentation de pilotage** : ce dépôt est suivi via des fichiers de gouvernance
> à la racine — `MASTER_ROADMAP.md` (découpage modulaire M001–M015 + backlog priorisé),
> `PROJECT_STATUS.md`, `MODULE_SPECS.md`, `TECHNICAL_DEBT.md`, `EXECUTION_LOG.md`.
> Le **repo est la source de vérité** ; ces docs sont réconciliés avec le code réel.

## Stack

- **Next.js 16** (App Router, React Server Components) + TypeScript `strict`
- **Prisma 7** + `@prisma/adapter-pg` (driver adapter obligatoire) + PostgreSQL — **56 modèles**
- **NextAuth 4** (Credentials + bcrypt, stratégie JWT, invalidation via `passwordChangedAt`)
- **Tailwind CSS 4** + composants type shadcn/ui (Radix UI)
- **Jest** (118 tests, 9 suites)
- Intégrations optionnelles : **Gemini** (moteur IA), **SMTP** (emails), **web-push/VAPID**
  (notifications), **Twilio** (SMS), **webhooks HMAC** (caisse/POS)

## Périmètre fonctionnel (modules)

| Module | Domaine |
|--------|---------|
| M001 | Auth, RBAC, sécurité, clés API service |
| M002 | Organisations, magasins, horaires, affectations |
| M003 | Employés / RH |
| M004 | Planning & shifts (solver + assistant IA manager) |
| M005 | Pointage & présence |
| M006 | Absences, remplacements, échanges, marché de shifts |
| M007 | Coûts & masse salariale (moteur coût employeur, réduction Fillon) |
| M008 | POS & intégrations caisse (sync ventes/pointages, webhooks HMAC) |
| M009 | Inventaire (app mobile : login PIN, scan, comptages) |
| M010 | Étiquettes / labels (PDF, ZPL) |
| M011 | Messagerie & communication RH (messages, annonces, fil d'actualité) |
| M012 | Notifications (push, email, préférences) |
| M013 | Analytics & performance employé |
| M014 | Moteur IA (embeddings, anomalies, conversation) |
| M015 | Alertes, audit, journal |

Détail et statut par module : voir `MASTER_ROADMAP.md`.

## Prérequis

- **Node.js** ≥ 20
- **PostgreSQL** (Docker Compose fourni, ou instance gérée)
- **npm**

## Installation

```bash
git clone <repo-url> && cd timewin24
npm install
cp .env.example .env          # puis renseigner les variables (voir ci-dessous)
docker compose up -d          # PostgreSQL local (si non géré)
npm run setup                 # prisma generate + db push + seed
npm run dev                   # http://localhost:3000
```

> ⚠️ `npm run setup` utilise `prisma db push` (applique le schéma sans migration
> versionnée). Pour un déploiement avec historique de migrations, préférer
> `prisma migrate deploy` (cf. `TECHNICAL_DEBT.md` / M131).

## Comptes de seed

Le seed (`prisma/seed.ts`) crée un jeu de données de démo. Comportement durci (M132) :

- **Refuse de s'exécuter en production** sauf `ALLOW_PROD_SEED=true`.
- Mots de passe via `SEED_ADMIN_PASSWORD` / `SEED_EMPLOYEE_PASSWORD` ; à défaut, des
  mots de passe de **dev uniquement** sont utilisés et `mustChangePassword=true` est
  forcé sur les comptes (changement obligatoire à la première connexion).
- Les identifiants ne sont imprimés en console qu'en mode défaut dev.

## Variables d'environnement

| Variable | Rôle | Requis |
|----------|------|--------|
| `DATABASE_URL` | Connexion PostgreSQL | **Oui** |
| `NEXTAUTH_SECRET` | Secret sessions JWT | **Oui** (prod) |
| `NEXTAUTH_URL` | URL de base de l'app | Oui (prod) |
| `INVENTORY_JWT_SECRET` | Secret JWT de l'app inventaire (sinon repli sur `NEXTAUTH_SECRET`) | Recommandé |
| `NEXT_PUBLIC_APP_URL` | URL publique (liens) | Selon usage |
| `SEED_ADMIN_PASSWORD`, `SEED_EMPLOYEE_PASSWORD` | Mots de passe de seed | Dev/seed |
| `ALLOW_PROD_SEED` | Autorise le seed en prod (`true`) | Non |
| `AI_ENGINE_ENABLED`, `AI_ASSISTANT_ENABLED`, `AI_ANOMALY_ENABLED`, `AI_NLP_ENABLED`, `AI_PERFORMANCE_ENABLED` | Bascules du moteur IA | Non |
| `GEMINI_API_KEY` | Clé API Gemini (IA) | Si IA activée |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envoi d'emails | Si emails |
| `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | Web-push | Si notifications push |
| `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS | Si SMS |

> Les secrets caisse/POS (webhooks HMAC) sont stockés **en base** (`PosProvider.webhookSecret`,
> recherché par `X-POS-Key-Id`), pas en variable d'environnement applicative.
> Procédure de rotation : `docs/SECURITY-ROTATION-RUNBOOK.md`.

## Commandes

```bash
npm run dev          # serveur de développement
npm run build        # prisma generate + build production
npm run start        # lancer le build de production
npm run test         # tests Jest
npm run lint         # ESLint
npm run setup        # prisma generate + db push + seed
npm run db:generate  # générer le client Prisma
npm run db:migrate   # prisma migrate dev (migration versionnée)
npm run db:push      # appliquer le schéma sans migration
npm run db:seed      # seed
npm run db:reset     # reset complet (force-reset) + re-seed
```

## Architecture

```
src/
  app/
    (auth)/          # connexion
    (dashboard)/     # back-office admin/manager (sidebar, protégé)
    (employee)/      # espace employé
    (shared)/        # vues partagées
    inventory/       # app mobile inventaire (login PIN, scan, comptages)
    api/             # route handlers (auth, stores, employees, shifts, planning,
                     #   absences, costs, integrations/pos, inventory, ai, ...)
  components/        # UI (ui/, planning/, analytics/, labels/, sidebar...)
  lib/
    auth.ts, rbac.ts, api-helpers.ts        # auth & autorisation
    inventory-jwt.ts, rate-limit.ts, hmac.ts, pos-auth.ts  # sécurité
    prisma.ts, validations.ts, utils.ts     # socle
    employer-cost.ts, decimal.ts, cost-mappers.ts  # coûts (M007/M101)
    solver/, manager-ia/, replacement.ts    # planning & remplacements
    pos/, ai-engine/, analytics/, notifications/, labels/
  __tests__/         # 9 suites Jest (118 tests)
prisma/
  schema.prisma      # 56 modèles
  migrations/        # migrations versionnées
  seed.ts            # seed durci (M132)
```

**Frontières** : `error.tsx` / `loading.tsx` sur `(dashboard)` et `(employee)`.

## Tests

```bash
npm test
```

118 tests (9 suites) couvrant notamment :
- détection de chevauchement de shifts (`shift-overlap`) ;
- construction de shifts du solver (`solver-shift-construction`) ;
- matrice RBAC par rôle, hiérarchie, helpers (`rbac`) ;
- moteur coût employeur + réduction Fillon + frontière Decimal (`employer-cost`) ;
- notifications planning, RBAC batch, validation, sanitization d'erreurs email ;
- hash de snapshot planning.

Couverture runtime applicative (intégration end-to-end, données réelles) : **non couverte**
par cette suite unitaire.

## Sécurité (état réel)

- Authentification requise sur les routes ; protection admin/manager (RBAC, `lib/rbac.ts`).
- **Invalidation de session** via `passwordChangedAt` (les JWT émis avant un changement
  de mot de passe sont rejetés).
- **Rate-limit + lockout** sur les logins (back-office et inventaire) — 5 tentatives,
  verrouillage 15 min. ⚠️ Limiteur **en mémoire** (par instance) ; un backend partagé
  (Redis) est recommandé pour le multi-instance (cf. M120).
- Webhooks POS authentifiés par **HMAC** (clé par fournisseur, recherchée par `X-POS-Key-Id`).
- Codes/PIN employé générés via **CSPRNG** (`crypto.randomInt`).
- Mots de passe **bcrypt** ; validation server-side **Zod** ; SQL brut paramétré.
- TLS 1.2/1.3 ; Docker non-root multi-stage ; `.env` git-ignoré.

Dette et points de vigilance connus (montants hors paie encore en `Float`, cascades
de suppression, etc.) : voir `TECHNICAL_DEBT.md`. Procédure de rotation de secrets :
`docs/SECURITY-ROTATION-RUNBOOK.md`.

## Choix techniques

- **Prisma 7 + adapter pg** : Prisma 7 impose un driver adapter (`@prisma/adapter-pg`).
- **Temps en `"HH:mm"`** : créneaux intra-journée comparés lexicographiquement.
- **Argent en `Decimal`** : le noyau paie/coût employeur (`CountryConfig`, `EmployeeCost`)
  utilise `Decimal` (exactitude) ; les montants hors paie restent à migrer (cf. M101b).

## CI

GitHub Actions (`.github/workflows/ci.yml`) : `prisma generate` → `tsc --noEmit` → `jest`
(bloquants) ; ESLint informatif. Déploiements Vercel (3 projets) sur les PR.

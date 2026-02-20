# TimeWin - Gestion de Planning du Personnel

Outil interne de gestion de planning multi-boutiques. Concu pour scaler jusqu'a 100 magasins.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Prisma 7** ORM + PostgreSQL
- **NextAuth 4** (Credentials + bcrypt)
- **shadcn/ui** style components (Radix UI + Tailwind CSS 4)

## Prerequis

- **Node.js** >= 18
- **Docker** + Docker Compose (pour PostgreSQL)
- **npm**

## Installation rapide

```bash
# 1. Cloner le projet
git clone <repo-url> && cd time_win

# 2. Installer les dependances
npm install

# 3. Lancer PostgreSQL via Docker
docker compose up -d

# 4. Configurer les variables d'environnement
cp .env.example .env
# (les valeurs par defaut fonctionnent avec le docker-compose fourni)

# 5. Generer le client Prisma, pousser le schema, et seeder la base
npm run setup

# 6. Lancer le serveur de dev
npm run dev
```

Ouvrir **http://localhost:3000**

## Comptes de test

| Role     | Email                    | Mot de passe |
|----------|--------------------------|--------------|
| Admin    | admin@timewin.fr         | admin123     |
| Employe  | jean.dupont@timewin.fr   | pass123      |

## Variables d'environnement

| Variable         | Description                        | Defaut                                                        |
|------------------|------------------------------------|---------------------------------------------------------------|
| `DATABASE_URL`   | URL de connexion PostgreSQL        | `postgresql://timewin:timewin_secret@localhost:5432/timewin`  |
| `NEXTAUTH_SECRET`| Secret pour les sessions JWT       | (a changer en production)                                     |
| `NEXTAUTH_URL`   | URL de base de l'application       | `http://localhost:3000`                                       |

## Commandes disponibles

```bash
npm run dev          # Lancer en mode dev
npm run build        # Build production
npm run start        # Lancer le build production
npm run test         # Lancer les tests unitaires
npm run setup        # Prisma generate + db push + seed (setup complet)
npm run db:generate  # Generer le client Prisma
npm run db:push      # Pousser le schema vers la DB
npm run db:seed      # Lancer le seed
npm run db:reset     # Reset complet de la DB + re-seed
```

## Structure du projet

```
src/
  app/
    (auth)/login/         # Page de connexion
    (dashboard)/          # Layout avec sidebar (protege)
      planning/           # Vue planning par boutique + par employe
      stores/             # CRUD magasins
      employees/          # CRUD employes
      audit/              # Journal d'audit
    api/
      auth/[...nextauth]/ # Auth API
      stores/             # API magasins
      employees/          # API employes
      shifts/             # API shifts (CRUD + duplicate + export)
      audit/              # API audit
  components/
    ui/                   # Composants de base (button, input, dialog...)
    planning/             # Composants planning (grille semaine, modal shift)
    sidebar.tsx           # Navigation laterale
    store-search.tsx      # Recherche de magasin avec autocomplete
  lib/
    prisma.ts             # Instance Prisma (singleton)
    auth.ts               # Configuration NextAuth
    validations.ts        # Schemas Zod
    shifts.ts             # Logique metier shifts (overlap, heures)
    shift-utils.ts        # Fonctions pures (testables sans DB)
    audit.ts              # Helper d'audit
    utils.ts              # Utilitaires (dates, semaines, formatage)
    api-helpers.ts        # Helpers API (auth, responses)
  __tests__/
    shift-overlap.test.ts # Tests de detection de chevauchement
prisma/
  schema.prisma           # Schema de base de donnees
  seed.ts                 # Script de seed (10 magasins, 30 employes, 2 semaines)
```

## Schema de base de donnees

```
User           1---0..1  Employee       (compte utilisateur lie a un employe)
Store          *---*     Employee       (via StoreEmployee, many-to-many)
Shift          *---1     Store          (un shift = 1 boutique)
Shift          *---1     Employee       (un shift = 1 employe)
AuditLog       *---1     User           (qui a fait quoi)
```

**Index performances:** `(store_id, date)`, `(employee_id, date)`, `(date)` sur Shift.

## Fonctionnalites

### Admin
- **Planning par boutique**: selecteur boutique avec recherche, grille 7 jours, navigation semaine
- **Planning par employe**: vue dediee avec total heures
- **Creer/modifier/supprimer** des shifts via modal
- **Duplication de semaine**: copie les shifts d'une semaine vers la suivante (par boutique)
- **Detection de conflits**: impossible d'affecter un employe a 2 shifts qui se chevauchent
- **Alerte depassement heures**: avertissement non-bloquant si l'employe depasse ses heures/sem
- **Export CSV**: export du planning d'une boutique pour une semaine
- **CRUD magasins** avec pagination et recherche
- **CRUD employes** avec affectation multi-boutiques
- **Journal d'audit**: log de toutes les modifications

### Employe
- **Lecture seule** de son propre planning
- **Navigation semaine par semaine**

## Tests

```bash
npm test
```

11 tests unitaires sur la fonction de detection de chevauchement de shifts couvrant:
- Chevauchement partiel, total, identique
- Shifts consecutifs (pas de chevauchement)
- Dates differentes
- Meme shift ID (exclusion de soi-meme en edition)
- Cas limites (1 minute de chevauchement)

## Securite

- Authentification obligatoire sur toutes les routes
- Protection admin sur toutes les routes d'administration
- Rate limiting sur login (5 tentatives max, verrouillage 15 min)
- Mots de passe hashe en bcrypt
- Validation server-side avec Zod sur toutes les entrees
- Sessions JWT (8h max)

## Choix techniques

**Prisma 7 + pg adapter**: Prisma 7 impose l'utilisation d'un driver adapter (`@prisma/adapter-pg`) au lieu de la connexion directe. Cela ajoute une dependance mais offre un meilleur controle sur le pool de connexions.

**Temps stockes en string "HH:mm"**: Plus simple qu'un DateTime complet pour des creneaux intra-journee. La comparaison lexicographique suffit pour la detection de chevauchement (pas de shifts a cheval sur minuit dans le scope MVP).

**Architecture plate**: Pas de couche "service" separee des routes API. Pour un MVP a perimetre restreint, les route handlers contiennent directement la logique. Si le projet grossit, extraire une couche service sera trivial.

## Ameliorations futures (NON implementees)

- **Drag & drop** sur la grille pour deplacer/redimensionner les shifts
- **Notifications** (email/push) quand le planning d'un employe change
- **Gestion des conges/absences** integree au planning
- **Templates de planning** reutilisables (ex: "semaine type hiver")
- **Vue multi-boutiques** pour comparer les plannings cote a cote
- **Mode hors-ligne** (PWA + sync)
- **Export PDF** du planning avec mise en page imprimable
- **API publique** avec cles API pour integration tierce
- **Historique / versioning** du planning (revenir a une version precedente)
- **Calcul automatique** de la masse salariale estimee
- **Support shifts de nuit** (chevauchement minuit)
- **i18n** multi-langue
- **RBAC avance** (manager de zone, responsable magasin)

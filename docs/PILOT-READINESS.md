# PILOT-READINESS — TimeWin24 (version interne mono-groupe)

> Guide de mise en pilote interne : état des modules, limites connues, modules
> dormants, installation, checklists de premier lancement.
> Cible : **logiciel interne mono-groupe multi-magasins** (pas un SaaS multi-client).
> Dernière mise à jour : 2026-07-04.

---

## 1. État des modules (vérifié)

| Module | État | Note |
|---|---|---|
| Employés (CRUD, rattachement magasin, accès) | ✅ complet | scoping manager appliqué |
| Magasins (CRUD, horaires, statut) | ✅ complet | |
| Planning manager (create/edit/dup/génération/conflits) | ✅ complet | manager-IA + solver branchés |
| Planning employé (vue perso) | ✅ complet | lecture seule scopée |
| Pointage (clock-in/out, statut jour) | ✅ complet | anti-spoofing appliqué |
| Absences / indisponibilités | ✅ complet | validation/refus + audit |
| Retards / alertes | ✅ complet | scoping magasin |
| Notifications (préférences, logs, dispatcher) | ✅ complet | envoi mockable si SMTP/VAPID absents |
| Paie / exports (preview, persist, CSV) | ✅ complet | quantités only ; **mapping éditeur = décision** |
| Contrats (EmploymentContract + UI Établissement) | ✅ complet | création via provisioning `persist` |
| Dashboard | ✅ complet | données réelles, scopées |
| Bridge POS (HMAC, feed, events, accès hors planning) | ✅ complet | clés scopées magasin |
| Audit log | ✅ complet (raisonnable) | cf. §3 politique d'audit |
| Société & unités (SIREN) | ✅ complet | page `/organisation` (admin) |
| Moteur IA | 🟡 **dormant** | cf. §2 |
| Solde de congés (CP) | 🔴 **absent** | cf. §2 (décision métier) |

**Le cœur pilote — login → magasins → employés → planning → pointage → absences → alertes → paie (preview/CSV) — est complet et utilisable.**

---

## 2. Modules dormants & limites connues (pas de fausse promesse)

- **Moteur IA (`src/lib/ai-engine/*`, `api/ai/*`)** — 🟡 **dormant**. Code présent
  (anomalies, assistant RAG, embeddings Gemini, analyse POS) mais **aucune UI ne
  l'appelle** → aucune fausse promesse à l'écran. À NE PAS confondre avec le
  **Manager-IA** (`lib/manager-ia` + solver) qui, lui, est branché dans le planning.
  Décision : laisser dormant (build non cassé) ; brancher plus tard si besoin.
- **Solde de congés (CP)** — 🔴 **absent**. Les jours *pris* sont comptés (paie),
  mais il n'existe **aucun compteur d'acquisition/solde**. Un vrai module CP exige
  une **décision métier** (règle d'acquisition 2,5 j/mois ? période de référence ?
  report ?) → hors périmètre pilote. La validation d'absence ne débite aucun solde.
- **`api/attendance/clock-in` / `clock-out`** — endpoint d'ingestion **POS/mobile**
  (GPS + photo) **sécurisé** (anti-spoofing) mais **non câblé à l'UI web** (le
  pointage web utilise `api/clock-in`). Réservé à une future app mobile / au POS.
- **`api/pos-events/failed`** — file des events POS en échec ; **pas de visualisation
  UI** (consultable via API/admin). Backlog UI.
- **`organizations` / `units` / `service-keys` / `connected-apps`** — organizations
  & units ont désormais la page `/organisation`. **`service-keys`** (clés API
  génériques) et **`connected-apps`** restent gérés par **seed / API** (POS géré via
  `/integrations`). Suffisant pour le pilote.

---

## 3. Politique d'audit (raisonnable, non sur-ingénierée)

**Audité vers `AuditLog`** : employés (CRUD, accès, reset), magasins (edit/toggle/suppr),
comptes, **clés API service (création/révocation)**, absences (validation/refus),
shifts (edit/dup/cancel), unités, organisations, connected-apps, produits, étiquettes,
messages, **paie** (contrats/établissement/inputs/persist/preview-export), planning
(génération/manager-IA/notify), intégrations POS, changement de mot de passe.

**Volontairement NON audité** (opérations routinières à fort volume, faible sensibilité) :
consultation en lecture, préférences de notification, config coûts pays, feed/broadcasts,
échanges/remplacements/marketplace, génération d'alertes. À réévaluer si un besoin de
conformité l'exige.

---

## 4. Runbook d'installation (local / staging — hors prod)

Prérequis : Node 20, PostgreSQL 14+.

```bash
# 1. Dépendances
npm ci

# 2. Variables d'env (voir .env.example — copier en .env)
cp .env.example .env
#   Renseigner au minimum : DATABASE_URL, NEXTAUTH_SECRET (>=32 car.), NEXTAUTH_URL

# 3. Client Prisma + schéma en base (base VIDE de dev/staging)
npm run db:generate
npm run db:deploy          # applique prisma/migrations (base neuve)
#   Alternative dev rapide : npm run db:push

# 4. Données de démarrage (admin + magasins + employés + shifts de démo)
SEED_ADMIN_PASSWORD='...'  SEED_EMPLOYEE_PASSWORD='...'  npm run db:seed

# 5. Lancer
npm run dev                # http://localhost:3000
#   Prod-like : npm run build && npm start
```

> Sur une **base prod déjà peuplée via `db push`** : NE PAS lancer `db:deploy`
> directement. Suivre la procédure de **baseline** de `docs/RUNBOOK-EXPLOITATION.md §2`
> (`prisma migrate resolve --applied` sur chaque migration existante). **Action ops
> nécessitant l'accès DB prod.**

---

## 5. Checklist — premier lancement

- [ ] `.env` renseigné (DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL).
- [ ] `npm run db:status` → « up to date ».
- [ ] Seed exécuté ; connexion admin OK (`admin@timewin.fr`).
- [ ] `/organisation` : créer la société, saisir le **SIREN**.
- [ ] Créer/valider les **magasins** + horaires.
- [ ] Créer des **employés**, les rattacher à leurs magasins, définir leurs rôles.
- [ ] Créer des **comptes** de connexion (managers/employés) via `/accounts`.
- [ ] Vérifier qu'un **manager** ne voit que ses magasins (planning, alertes, paie).

## 6. Checklist — test d'un magasin pilote

- [ ] Générer un **planning** de semaine (manuel ou auto/manager-IA).
- [ ] Un **employé** voit son planning (`/mon-planning`), pas celui des autres.
- [ ] **Pointage** entrée/sortie (`/pointage`) → apparaît dans `/pointages`.
- [ ] Déclarer une **absence** → **validation manager** (`/absences`).
- [ ] Vérifier les **alertes** (retard, magasin non ouvert).
- [ ] **Paie** : `/paie` → Aperçu (quantités), enregistrer un brouillon, valider.
- [ ] **Export CSV** paie ; vérifier l'en-tête (aucun montant).
- [ ] (Si POS) configurer une **clé POS** liée au magasin ; vérifier qu'elle
      n'accède qu'à ce magasin.

## 7. Checklist — accès / secrets / DB à fournir (côté humain)

Ces éléments **ne peuvent pas être produits par l'agent** (accès/secret/prod) :

- [ ] **`DATABASE_URL`** de la base cible (staging puis prod).
- [ ] **`NEXTAUTH_SECRET`** (aléatoire ≥32 caractères) + **`NEXTAUTH_URL`** publique.
- [ ] Mots de passe seed (`SEED_ADMIN_PASSWORD`, `SEED_EMPLOYEE_PASSWORD`).
- [ ] (Optionnel) SMTP / VAPID / Twilio / `GEMINI_API_KEY` selon fonctionnalités.
- [ ] **Rotation des 3 secrets committés** (`docs/SECURITY-ROTATION-RUNBOOK.md`) — ops.
- [ ] **Baseline migrations** sur la base prod existante (`migrate resolve`) — ops.
- [ ] Politique de **backup** PostgreSQL (cf. `RUNBOOK-EXPLOITATION.md §5`).

---

## 8. Décisions humaines restantes (isolées)

1. Tenancy : mono-groupe (retenu) ; SaaS multi-tenant = plus tard, hors périmètre.
2. Format de **mapping paie concret** (Silae/Sage/…) pour l'export final.
3. **Solde de congés** : règle d'acquisition CP (si module souhaité).
4. Sort du **moteur IA** (finir le branchement ou laisser dormant).
5. Pont **PosTimeClock → ClockIn** (si la présence POS doit compter en paie).

# Plan de déploiement TimeWin24 SaaS App Store

> ⚠ **AUCUN DÉPLOIEMENT TANT QUE CE PLAN N'EST PAS VALIDÉ ÉCRAN PAR ÉCRAN**

Ce document décrit la procédure exacte pour déployer la variante SaaS App Store sur un projet Vercel **dédié**, **sans toucher** à la prod actuelle `timewin24.fr`.

---

## 🛑 RÈGLES ABSOLUES

1. **Ne JAMAIS pousser sur `main`** — `main` reste sur `39e2308` (prod actuelle Movo24).
2. **Ne JAMAIS connecter le projet Vercel SaaS au projet existant `timewin24`** (project ID `prj_NbDfZl0gpbBXtinqKh8eg0z0XxsI`).
3. **Ne JAMAIS réutiliser** la `DATABASE_URL` de la prod actuelle pour le SaaS.
4. **Ne JAMAIS réutiliser** le `NEXTAUTH_SECRET` de la prod actuelle.
5. **Le mot de passe Neon doit avoir été reset** (déjà fait — mais nouvelle URL à fournir).

---

## ⚠ État actuel à connaître

- `.vercel/project.json` (local, non-tracké) est lié au projet **`timewin24`** prod.
  → Il faut **délier** ce linkage avant de créer le nouveau projet, OU utiliser la création du projet via le dashboard Vercel sans CLI.
- Branche `appstore-saas` est à `0ad8ee3` sur `origin`.
- `main` est à `39e2308` sur `origin`.

---

## Phase A — Pré-vérifications (à faire toi-même)

### A.1 — Vérifier la nouvelle DB Neon SaaS
La DB SaaS dédiée a été créée en Phase 3 (projet Neon `still-grass-74159459`, nom interne `timwine24-saas-appstore`, region `eu-central-1`).
Le password a été **reset 1 fois** après les expositions de session. Il faut **récupérer la connection string ACTUELLE** :

1. Connecter à https://console.neon.tech
2. Ouvrir le projet `timwine24-saas-appstore`
3. Cliquer **Connect** → modale "Connect to your database"
4. Si tu as un doute sur la fraîcheur du password : **Reset password** (Apple Review n'a pas encore vu de prod, c'est encore safe)
5. Copier la string `postgresql://neondb_owner:npg_XXX@<HOST-NEON-SAAS>.aws.neon.tech/neondb?sslmode=require`

### A.2 — Générer `NEXTAUTH_SECRET` dédié SaaS
```bash
openssl rand -hex 32
```
Garde ce secret en sécurité (1Password, etc.) — il ne doit JAMAIS être committé.

### A.3 — Choisir un mot de passe Demo Owner solide
Le seed expose `DemoOwner!2026` par défaut. Pour la prod App Store Review, override :
```bash
openssl rand -base64 16 | tr -d '/+='
```
Exemple : `Xk9mP2vNqL8tR4Wy`

### A.4 — Préparer le domaine
- Acheter / configurer `app.timewin24.com` (ou autre sous-domaine)
- Préparer le DNS CNAME vers Vercel (sera fourni par Vercel après création du projet)

---

## Phase B — Création projet Vercel SaaS (dashboard, PAS CLI)

> ⚠ **NE PAS utiliser `vercel link` localement** — ça écraserait le linkage prod existant.
> Faire tout via le **dashboard Vercel** dans le navigateur.

### Écran 1 — Create New Project
1. Aller sur https://vercel.com/dashboard
2. Cliquer **Add New** → **Project**
3. Onglet **Import Git Repository**
4. Trouver `movo24/timewin24` (le même repo que la prod, c'est normal)
5. Cliquer **Import**

### Écran 2 — Configure Project

| Champ | Valeur |
|---|---|
| Project Name | **`timewin24-saas-appstore`** |
| Framework Preset | Next.js (auto-détecté) |
| Root Directory | `./` (défaut) |
| Build Command | (laisser défaut : `npm run build`) |
| Output Directory | (laisser défaut) |
| Install Command | (laisser défaut : `npm install`) |
| Node.js Version | 20.x |

### Écran 3 — Production Branch ⚠ CRITIQUE
1. Dérouler **Build and Deployment Settings**
2. Section **Git** → **Production Branch**
3. **CHANGER** : `main` → **`appstore-saas`**

> ⚠ Si tu laisses `main`, Vercel déploiera la version Movo24 sur ton nouveau projet. **Obligatoire** de mettre `appstore-saas`.

### Écran 4 — Environment Variables
**Ne PAS cliquer Deploy maintenant.** Ajouter d'abord toutes les vars :

| Nom | Valeur | Visibilité |
|---|---|---|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_NEW@<HOST-NEON-SAAS>.aws.neon.tech/neondb?sslmode=require` | Production, Preview, Development |
| `NEXTAUTH_URL` | `https://app.timewin24.com` (ou domaine choisi) | Production |
| `NEXTAUTH_SECRET` | `<openssl rand -hex 32>` | Production, Preview, Development |
| `TIMEWIN_VARIANT` | `appstore` | Production, Preview, Development |
| `DEMO_OWNER_PASSWORD` | `<password fort généré>` | Production |
| `SMTP_HOST` | `smtp.resend.com` | Production |
| `SMTP_PORT` | `465` | Production |
| `SMTP_USER` | `resend` | Production |
| `SMTP_PASS` | `<clé API Resend>` | Production |
| `SMTP_FROM` | `noreply@app.timewin24.com` | Production |

**Important** : pour chaque variable, cocher seulement **Production** (les autres environments ne sont pas utilisés).

### Écran 5 — Deploy
1. Cliquer **Deploy**
2. Attendre 2-5 minutes (build + deploy)
3. Vercel affiche un URL temporaire : `https://timewin24-saas-appstore-xxx.vercel.app`

### Écran 6 — Custom Domain
1. Aller dans **Project Settings** → **Domains**
2. Ajouter `app.timewin24.com`
3. Suivre les instructions DNS (CNAME → `cname.vercel-dns.com`)
4. Attendre la propagation DNS (1-30 minutes)
5. Vercel auto-génère le certificat SSL

---

## Phase C — Smoke tests post-déploiement (à faire toi-même)

### C.1 — Pages publiques accessibles SANS connexion
```bash
curl -I https://app.timewin24.com/privacy
# attendu : HTTP/2 200

curl -I https://app.timewin24.com/terms
# attendu : HTTP/2 200

curl -I https://app.timewin24.com/support
# attendu : HTTP/2 200
```

### C.2 — Routes protégées REDIRIGENT vers login
```bash
curl -I https://app.timewin24.com/dashboard
# attendu : HTTP/2 307 (redirect vers /admin-login)

curl -I https://app.timewin24.com/onboarding
# attendu : HTTP/2 307 (redirect vers /admin-login)
```

### C.3 — Routes POS / AI DÉSACTIVÉES (flag check)
```bash
curl -X POST https://app.timewin24.com/api/pos-events/webhook \
  -H "Content-Type: application/json" -d '{}'
# attendu : HTTP/2 404 {"error":"Feature not available"}

curl -X POST https://app.timewin24.com/api/ai/assistant \
  -H "Content-Type: application/json" -d '{}'
# attendu : HTTP/2 404 {"error":"Feature not available"}
```

### C.4 — Login Demo Owner
1. Ouvrir https://app.timewin24.com/login
2. Email : `demo-owner@timewin24.app`
3. Password : celui défini via `DEMO_OWNER_PASSWORD` env var
4. Vérifier :
   - Si onboardingStep < 99 → redirige vers `/onboarding`
   - Si onboardingStep = 99 → arrive sur `/dashboard`

### C.5 — Sidebar SaaS (variant=appstore)
Connecté en OWNER, vérifier que la sidebar **ne montre PAS** :
- ❌ Intégrations
- ❌ Étiquettes
- ❌ Performance
- ❌ Coûts
- ❌ Annonces / Fil d'actualité

Et montre :
- ✅ Tableau de bord
- ✅ Magasins
- ✅ Employés
- ✅ Planning
- ✅ Pointages
- ✅ Absences
- ✅ Messages RH
- ✅ Comptes
- ✅ Audit

### C.6 — Account deletion accessible
1. Aller sur https://app.timewin24.com/account/delete
2. Vérifier que la page s'affiche
3. **NE PAS cliquer Supprimer** (sauf si compte test jetable)

---

## Phase D — Vérifications après mise en main

### D.1 — Confirme que prod actuelle n'est PAS impactée
- https://timewin24.fr — doit toujours marcher comme avant
- Aucun déploiement sur le projet Vercel `timewin24` n'a été déclenché
- `main` est toujours sur `39e2308`

### D.2 — Confirme l'isolation des DB
- Sur `app.timewin24.com` : `demo-owner@timewin24.app` peut se connecter (DB SaaS)
- Sur `timewin24.fr` : cet email **n'existe pas** (DB prod différente)

---

## Phase E — Rollback (si problème)

Si quelque chose tourne mal :

### Option 1 — Rollback via Vercel UI
1. Vercel dashboard → projet `timewin24-saas-appstore` → **Deployments**
2. Cliquer sur un déploiement précédent → **Promote to Production**

### Option 2 — Désactiver temporairement le projet
1. Vercel dashboard → Settings → **Pause Project**
2. Le domaine retourne 503 jusqu'à réactivation

### Option 3 — Désactiver la DB Neon (urgence sécurité)
1. https://console.neon.tech → projet `timwine24-saas-appstore`
2. **Suspend compute** (la DB devient inaccessible jusqu'à réactivation)

> ❌ **NE JAMAIS** rollback en pushant sur `main` ou en touchant la branche `appstore-saas` — c'est du Vercel UI, pas du Git.

---

## Phase F — Apple App Store Submission (hors code)

Ces items sont **opérationnels**, à faire après que le SaaS soit stable :

| Item | Responsable | Statut |
|---|---|---|
| Compte Apple Developer | Toi | ⏳ |
| App Store Connect setup | Toi | ⏳ |
| App icon (1024x1024 PNG) | Design | ⏳ |
| Screenshots iPhone/iPad | Design | ⏳ |
| App Privacy Details | À remplir avec contenu de `/privacy` | ⏳ |
| Demo account info | `demo-owner@timewin24.app` + password | ⏳ |
| Support URL | `https://app.timewin24.com/support` | ✅ déjà OK |
| Privacy Policy URL | `https://app.timewin24.com/privacy` | ✅ déjà OK |
| Description / Keywords | Marketing | ⏳ |

---

## Récapitulatif des choses **à NE PAS faire**

| ❌ Action | Raison |
|---|---|
| `git push main` | Casserait la prod Movo24 |
| `vercel deploy` depuis ce répertoire local | Déploierait sur le projet prod (linkage existant) |
| Réutiliser la même `DATABASE_URL` | Mélange prod/SaaS = fuite données |
| Réutiliser le même `NEXTAUTH_SECRET` | Cookies partagés entre prod et SaaS = sessions cross-tenant |
| Connecter le nouveau projet à `main` au lieu de `appstore-saas` | Déploie la variante Movo24 sur le SaaS |
| Oublier `TIMEWIN_VARIANT=appstore` | Le SaaS apparaîtrait avec tous les modules POS/AI/etc visibles |
| Pousser le `.vercel/project.json` au repo | Linkage prod commité = chaos |

---

## Checklist finale avant de cliquer Deploy

- [ ] Branche `appstore-saas` à jour sur `origin` (✅ `0ad8ee3` actuellement)
- [ ] DB Neon SaaS dédiée vérifiée (eu-central-1, password fresh)
- [ ] `NEXTAUTH_SECRET` généré et stocké en sécurité
- [ ] `DEMO_OWNER_PASSWORD` généré et stocké en sécurité
- [ ] Domaine acheté / DNS prêt
- [ ] Nouveau projet Vercel créé (PAS l'existant)
- [ ] Production Branch = `appstore-saas` (PAS `main`)
- [ ] Les 10 env vars saisies en Production
- [ ] **VALIDATION FINALE** : tu confirmes que tout est OK avant de cliquer Deploy

---

## Si tu veux que je le fasse pour toi

Je peux **uniquement** :
- Lire ce plan avec toi
- Vérifier l'état local (Git, branche, schema)
- Préparer des scripts de smoke test à lancer après déploiement
- Aider à déboguer les erreurs post-déploiement

Je **ne peux pas** :
- Cliquer dans le dashboard Vercel à ta place
- Saisir les env vars dans Vercel
- Configurer le DNS de ton domaine
- Soumettre à Apple App Store

Ces actions sont volontairement gardées en manuel pour que **toi** gardes le contrôle de la production.

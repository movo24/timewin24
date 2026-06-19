# Runbook de rotation de credentials — Incident `6332a54`

> **Statut :** à exécuter. Document de référence ops. Ne contient **aucune** valeur de
> secret en clair (uniquement emplacements + valeurs masquées). Ne jamais coller de
> secret réel dans ce fichier — il est suivi par git.

## Contexte

Trois credentials ont été committés dans l'historique au commit **`6332a54`**
(« feat: employee code format changed… ») et sont toujours présents à HEAD.

| # | Secret | Emplacement (tracké) | Valeur (masquée) |
|---|--------|----------------------|------------------|
| 1 | Login admin | `.playwright-mcp/console-2026-03-20T11-22-44-309Z.log:23-31` (param URL) | `omar@candyshop.com` / `Admin2026!` |
| 2 | Rôle Postgres `caisse` | `scripts/setup-pos-integration.ts:11` | `postgresql://caisse:Cws2026Prod…9x@…/caisse` |
| 3 | `POS_SECRET` (HMAC webhook) | `scripts/setup-pos-integration.ts:9` (+ echo `:54,169,170`) | `pos_secret_candy_****` |

**Règle d'or : rotation d'abord, purge d'historique ensuite.** Tant que la rotation
n'est pas faite, la purge ne ferme pas l'incident. Une fois rotatés, les anciens secrets
deviennent **inertes** même s'ils restent dans l'historique (la purge devient du
durcissement, pas une urgence). Les trois items sont indépendants → parallélisables.

---

## 1. Compte admin `omar@candyshop.com` — unilatéral, immédiat

Valeur brûlée : `Admin2026!`.

1. Se connecter avec un **autre** compte admin, ou réinitialiser via
   `POST /api/accounts/[id]/reset-password` (admin-gated).
2. Définir un **nouveau mot de passe fort** + `mustChangePassword=true`.
3. **Invalidation de session :** `src/lib/auth.ts:128-157` re-vérifie `passwordChangedAt`
   à chaque refresh JWT → toutes les sessions actives du compte sont invalidées
   automatiquement. Vérifier que l'ancien mot de passe échoue.
4. Recommandé : passer en revue l'audit log depuis le 2026-03-20 pour détecter toute
   connexion avec `Admin2026!`.

⏱️ ~5 min · 👤 admin · ↩️ rollback : redéfinir un mot de passe (aucun risque data).

---

## 2. Rôle Postgres `caisse` — unilatéral, fenêtre courte

Valeur brûlée : mot de passe du rôle `caisse` sur la base **`caisse`** (≠ base TimeWin).

1. **Inventorier les consommateurs** avant de couper. Au minimum :
   - l'application **CAISSE** (sa connexion DB) ;
   - la variable `CAISSE_DB_URL` (utilisée par `scripts/setup-pos-integration.ts`,
     référencée dans `scripts/test-pos-webhook.sh`).
   - ⚠️ Liste à compléter côté ops — tout autre service lisant la base `caisse`.
2. `ALTER ROLE caisse WITH PASSWORD '<nouveau>';`
3. Mettre à jour **tous** les consommateurs via un secret manager (jamais en dur dans un
   fichier tracké).
4. **Vérif :** une requête applicative CAISSE passe ; `psql` avec l'ancien mot de passe
   échoue.

⏱️ ~15 min · 👤 ops DB · ↩️ rollback : re-`ALTER` l'ancien mot de passe (coordonner la fenêtre).

---

## 3. `POS_SECRET` (HMAC webhook TW24 ↔ CAISSE) — overlap double-keyId, zéro downtime

Valeur brûlée : `pos_secret_candy_****` (signe `POST /api/pos-events/webhook`).

**Mécanique :** la vérification (`src/lib/pos-auth.ts:38-52`) récupère **un seul**
`webhookSecret` en **DB**, par `X-POS-Key-Id` (= `id` du `PosProvider`). Le code ne
supporte pas deux secrets pour une même clé. Le legacy `X-POS-Secret` est déjà refusé
(`src/lib/pos-auth.ts:10`). On bascule donc par **double keyId** :

1. Créer un **nouveau `PosProvider`** (nouveau `id` = nouveau keyId) avec un
   `webhookSecret` fort aléatoire (`openssl rand -hex 32`). Noter son `id`.
2. Recréer le `PosStoreLink` (même `posStoreId` CAISSE) vers ce nouveau `providerId`
   (résolution du magasin dans `src/app/api/pos-events/webhook/route.ts:53`).
3. Côté **CAISSE** : `X-POS-Key-Id` = nouveau provider id, `TIMEWIN24_POS_SECRET` =
   nouveau secret (depuis le secret manager).
4. **Overlap :** les deux providers coexistent → CAISSE bascule sans rejet. Surveiller
   que les events arrivent signés avec le nouveau keyId.
5. **Couper l'ancien :** `active=false` puis suppression de l'ancien `PosProvider`
   → l'ancien secret devient inerte.
6. **Vérif :** webhook signé avec l'ancien keyId/secret → `401` ; avec le nouveau → `201`.

> Alternative « cut » (micro-coupure acceptable) : `UPDATE` du `webhookSecret` existant +
> mise à jour CAISSE dans la même fenêtre → quelques secondes de webhooks rejetés. Le
> double-keyId l'évite.

Le secret POS étant en DB, sa rotation **ne nécessite aucun déploiement**.

⏱️ ~30 min · 👤 ops TW24 + CAISSE · ↩️ rollback : réactiver l'ancien provider tant que le nouveau n'est pas confirmé.

---

## Après les 3 rotations — durcissement (lot séparé)

Une fois les secrets inertes :

### Étapes non destructives — FAITES (commit `5f4f756`)

1. ✅ Valeurs sorties de `scripts/setup-pos-integration.ts` vers `process.env`
   **sans fallback** (`reqEnv`), secrets masqués dans les logs.
2. ✅ `.playwright-mcp/` (67 fichiers, dont le log fuitant les creds admin) retiré du
   suivi git (`git rm --cached`). Déjà couvert par `.gitignore`.

> Ces étapes **ne ferment pas** l'exposition d'historique : les valeurs restent dans
> l'historique git jusqu'à la purge. Tant que la **rotation** est faite, l'exposition
> résiduelle est **inerte**.

### Étape destructive — GATED (à exécuter seulement après rotation + GO)

**Ordre impératif** — la purge réécrit l'historique et **invalide le SHA vert** de la PR #6,
en déplaçant ses commits :

> **rotation → purge historique → rebase PR #6 → re-run CI → merge**

Ne **jamais** merger #6 sur un vert antérieur à la purge : il ne survit pas au force-push.

**Sécurité force-push (PR ouverte) :**
- Un force-push mal cadré sur la branche de #6 **ou sur `main`** peut fermer/casser la PR.
- Coordonner : purge sur **toutes** les branches concernées (`main` + branche #6) en une
  passe, prévenir les collaborateurs (re-clone obligatoire), puis rebaser #6 sur le `main`
  réécrit et laisser la CI re-tourner avant tout merge.
- Protéger temporairement : désactiver les déploiements auto le temps de la fenêtre si besoin.

**Commande (à valider, non exécutée ici) :**
```bash
# Depuis un clone frais, après backup du repo (miroir)
git clone --mirror <repo> repo-purge && cd repo-purge
git filter-repo \
  --path scripts/setup-pos-integration.ts --path-glob '.playwright-mcp/*' \
  --invert-paths   # OU --replace-text avec les valeurs des 3 secrets pour ne purger que les blobs
# Vérifier l'absence des secrets, puis :
git push --force --all && git push --force --tags
```
> `--invert-paths` supprime les fichiers entiers de l'historique ; si l'historique du script
> doit être conservé, préférer `--replace-text` (remplace uniquement les valeurs des secrets).
> Sauvegarde miroir **obligatoire** avant toute réécriture.

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
`webhookSecret` en **DB** (colonne `PosProvider.webhookSecret`, `@unique`), par
`X-POS-Key-Id` (= `id` du `PosProvider`). Le legacy `X-POS-Secret` est déjà refusé
(`src/lib/pos-auth.ts:10`).

### Méthode recommandée — SWAP IN-PLACE (containment + intégrité)

Le secret étant **compromis**, l'objectif est de le rendre inerte **au plus vite**, pas de
préserver le zéro-downtime. Le swap in-place ne crée aucun provider en double :

```sql
-- 0. Générer UNE fois (hors SQL) :  openssl rand -hex 32  →  $NEW_SECRET
--    Identifier le provider :  SELECT id,name FROM "PosProvider" WHERE active=true;  → $PROVIDER_ID
-- 1. Swap in-place (keyId INCHANGÉ)
UPDATE "PosProvider" SET "webhookSecret"='$NEW_SECRET', "updatedAt"=now() WHERE id='$PROVIDER_ID';
-- 2. CAISSE/.env  (MÊME valeur, keyId inchangé) : TIMEWIN24_POS_SECRET=$NEW_SECRET
-- 3. Vérif : webhook signé nouveau secret → 201 ; ancien secret → 401
```

- **Ordre = DB d'abord** (étape 1 avant étape 2). L'`UPDATE` DB **tue le secret brûlé à
  l'instant T**. Faire `CAISSE/.env` d'abord laisserait l'ancien secret valide côté TW24 plus
  longtemps pour rien. Seul coût du DB-first : une fenêtre où CAISSE signe encore l'ancien
  → `401`.
- **Cohérence des 2 écritures** : `$NEW_SECRET` de l'étape 1 (DB) et de l'étape 2
  (`CAISSE/.env`) doivent être **identiques**, sinon l'auth CAISSE↔TW24 casse.
- **`.env` écrit ≠ effectif.** Le nouveau secret ne s'applique qu'après **reload/restart du
  process CAISSE** — la fenêtre de rejet réelle court jusqu'au **restart**, pas jusqu'à
  l'écriture du fichier. Ne pas sous-estimer le gap : éditer `.env` *puis* redémarrer/reloader.
- **Gap de sync** assumé : pendant cette fenêtre, les events sont rejetés `401`. ⚠️ Ils
  n'atteignent **pas** `/api/pos-events/failed` (rejet à l'auth, avant traitement) → le
  rattrapage dépend du **retry côté CAISSE**. Vérifier ce retry, ou planifier en heure creuse.
- **Verify-gate avant de déclarer « fait »** : envoyer un event test signé avec le **nouveau**
  secret → `201` attendu, **et** l'ancien secret → `401`, *avant* de tourner la page. Sans ce
  test, on peut croire la rotation faite sur une auth cassée silencieuse.
- ↩️ rollback : re-`UPDATE` avec une **autre** valeur neuve (l'ancienne est brûlée → ne jamais
  y revenir).

### Alternative DÉCONSEILLÉE — dual-keyId (zéro-downtime)

⚠️ **Incorrect dans ce schéma.** `providerId` entre dans des clés uniques composites de
`processEvent` (`providerId_posRecordId` dedup — `route.ts:215,292,305` ; et
`providerId_storeId_date_hourSlot` agrégation — `route.ts:125`). Or `findFirst({where:{posStoreId}})`
(`route.ts:53`, **sans `orderBy`** → ordre indéfini) peut résoudre un même record tantôt sous
l'ancien, tantôt sous le nouveau `providerId` pendant l'overlap → **dedup cassé (ventes
dupliquées) + agrégats splittés (heures double-comptées)**. À n'utiliser que si un gap de
sync est **inacceptable**, et alors :
- fenêtre verify→cut **serrée** (ancien coupé dans la minute, pas de coexistence prolongée
  qui laisse le secret brûlé valide) ;
- au cut : `UPDATE "PosProvider" SET active=false` sur l'ancien (**jamais `DELETE`** — préserve
  la lignée d'audit et évite un saut de FK), et `DELETE` du seul `PosStoreLink` orphelin pour
  lever l'ambiguïté `findFirst`.

⏱️ ~15 min (swap) · 👤 ops TW24 + CAISSE · le secret POS étant en DB, sa rotation **ne nécessite aucun déploiement** TW24.

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

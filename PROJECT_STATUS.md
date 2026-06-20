# PROJECT_STATUS — TimeWin24

> Snapshot vérifié du chantier. Source de vérité = le repo, pas l'historique de chat.
> Dernière mise à jour : 2026-06-20.

## État build / qualité (vérifié)

| Contrôle | Résultat | Méthode |
|---|---|---|
| TypeScript (`tsc --noEmit`) | ✅ 0 erreur | exécuté (après `prisma generate`) |
| Tests unitaires (`jest`) | ✅ 95/95 (7 suites) | exécuté |
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

## Avancement de cette session (méthode modulaire)

- ✅ M2 — génération PIN/code en CSPRNG (`crypto.randomInt`).
- ✅ M11 — suppression des fuites de message d'erreur (ai/test, ai/pos-analysis, pos-feed/store-schedules).
- ✅ Docs de pilotage créés (ce fichier + MASTER_ROADMAP, MODULE_SPECS, TECHNICAL_DEBT, EXECUTION_LOG).

Détail des priorités et du backlog : voir `MASTER_ROADMAP.md`.

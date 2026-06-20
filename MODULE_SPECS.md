# MODULE_SPECS — TimeWin24

> Spécifications de référence par module (contrats, flux, points d'attention).
> Backlog & statuts : `MASTER_ROADMAP.md`. Dette : `TECHNICAL_DEBT.md`.

## Conventions transverses
- **Auth des routes** : `requireAdmin()` / `requireManagerOrAdmin()` / session via `api-helpers.ts` → `{ session, error }`. Boilerplate répété ~249× sur 122 routes → cible d'extraction service.
- **Validation** : Zod (`lib/validations.ts`) — appliqué sur stores/employees/accounts/costs/etc., **incohérent** sur ai/*, notifications/*, inventory/* (utiliser `safeParse`).
- **Réponses** : `successResponse()` / `errorResponse()` ; messages d'erreur **génériques** côté client, détail en `console.error` serveur.
- **Multi-écritures** : envelopper dans `prisma.$transaction`.
- **Argent** : viser `Decimal` (cf. M101). Temps shift en string `"HH:mm"`.

## M001 — Auth & RBAC
- NextAuth JWT (24h). `jwt` callback re-checke `active` + `passwordChangedAt` à chaque refresh → **invalidation de session** sur changement de mot de passe (auth.ts:128-147).
- Lockout DB : `failedAttempts`/`lockedUntil` (5 essais / 15 min).
- Double auth API : Bearer `ServiceApiKey` (rôle stocké) + HMAC POS.
- À faire : tests matrice RBAC ; rate-limiter partagé (M120).

## M004 — Planning & Shifts (cœur)
- `solver/` : pur en mémoire (pas de N+1) — constraints → scoring → suggestions. Mode « shift-construction » par défaut.
- `manager-ia/` : parser (NL) → resolver → planner ; **apply plan = create/update/delete séquentiels sans transaction** (M112).
- Détection chevauchement : comparaison lexicographique `"HH:mm"` (testée).
- Contrat shift : `Shift(storeId, employeeId, date, start, end)`.

## M006 — Absences / Remplacements / Échanges / Marché
- Flux : `AbsenceDeclaration` (approbation) → `createReplacementOffers` (⚠️ hors tx, M112) → `ReplacementCandidate` (éligibilité via `reliability-score`).
- `findEligibleCandidates` : N+1 à corriger (M113).
- FK `String` sans relation sur `ShiftExchange`/`ShiftMarketListing`/`ReplacementOffer` (M114).

## M007 — Coûts
- `employer-cost.ts` : calcule coût employeur par pays (`CountryConfig`) avec arrondis manuels `Math.round(n*100)/100` → **dette `Float`** (M101).
- Critère validation : tests de bord (seuils réduction, heures supp).

## M008 — POS & Intégrations
- Webhook `pos-events/webhook` : auth HMAC (`validatePosAuth` → `validateHmac`), secret = `PosProvider.webhookSecret` par `X-POS-Key-Id`.
- `processEvent` : `providerId` entre dans clés composites `providerId_posRecordId` (dedup) et `providerId_storeId_date_hourSlot` (agrégation) → **rotation POS = swap in-place** (un seul providerId), pas dual-keyId.
- Résolution magasin : `PosStoreLink.findFirst({posStoreId})` (sans orderBy).

## M009 — Inventaire
- JWT dédié (`inventory-jwt`, 8h, scope `inventory`). Login durci (rate-limit + lockout, M102).
- `IdempotencyKey` pour les scans (anti-doublon).

## M012 — Notifications
- `dispatcher` → email (`nodemailer`) / push (`web-push`) / sms. `planning-hash` pour snapshot. Tests : planning-email, notify-rbac, validation.
- `notifications/clicked` non authentifié (M121).

## M014 — IA Engine
- `ai-engine/shared/gemini-client` (`@google/generative-ai`). Sous-modules : anomaly, assistant, nlp, performance, pos-analysis. Usage tracké (`AiApiUsage`).
- SQL brut `ai/test` paramétré (sûr).

## Modules « radar » (futurs, si extension business)
Non présents dans le repo ; spécifiés au besoin. Hors périmètre TimeWin24 actuel.

---
Pour les autres modules (M002/M003/M005/M010/M011/M013/M015), voir MASTER_ROADMAP (fichiers/API/modèles). Spécifier ici à mesure qu'on les retravaille.

# M114 — Relations FK manquantes (`String` FK sans `@relation`) — PLAN PRÉPARÉ

> Statut : **préparé, non appliqué** (ops-gated). Raison : ce repo déploie via
> `prisma db push` ; ajouter une contrainte FK sur des données contenant des
> orphelins **casserait le déploiement**. Un check pré-vol (DB) est requis avant
> d'appliquer. Ce document contient l'analyse, le schéma cible, le SQL de
> détection d'orphelins et la migration auto-réparatrice.

## 1. Décision d'inclusion (audit du repo réel)

| Modèle | FK `String` | Décision | Raison |
|---|---|---|---|
| **PosTimeClock** | `employeeId`, `storeId`, `shiftId?` | ❌ **EXCLU** | Données **importées du POS**. Le POS peut référencer un employé/magasin **pas encore synchronisé** dans TimeWin. Le webhook (`pos-events/webhook`) logge l'erreur **sans bloquer** l'import. Une FK stricte **rejetterait** ces imports → perte de résilience d'ingestion. La relation-absence est **intentionnelle**. |
| **ShiftExchange** | `requesterId`, `requesterShiftId`, `targetId`, `targetShiftId?`, `managerId?` | ✅ inclure | Entités **internes TimeWin** (toujours des refs valides créées par l'app). |
| **ReplacementOffer** | `absentEmployeeId`, `absenceId?`, `filledByEmployeeId?` | ✅ inclure | Internes TimeWin. (`shift`/`store` ont déjà leur relation.) |
| **ShiftMarketListing** | `posterId`, `shiftId`, `storeId`, `claimantId?`, `managerId?` | ✅ inclure | Internes TimeWin. |

## 2. Politiques `onDelete` (alignées sur M111 — protection des preuves)

Non-nullables référençant Employee/Store → `Restrict` (cohérent M111 : on
désactive, on ne détruit pas l'historique). Shift dépendant → `Cascade` (une
offre/un échange pour un shift supprimé n'a plus de sens). Nullables → `SetNull`.

| Modèle.champ | → cible | onDelete | Champ inverse à ajouter |
|---|---|---|---|
| ShiftExchange.requesterId | Employee | Restrict | `shiftExchangesRequested ShiftExchange[]` |
| ShiftExchange.targetId | Employee | Restrict | `shiftExchangesTargeted ShiftExchange[]` |
| ShiftExchange.requesterShiftId | Shift | Cascade | `exchangesAsRequesterShift ShiftExchange[]` |
| ShiftExchange.targetShiftId? | Shift | SetNull | `exchangesAsTargetShift ShiftExchange[]` |
| ShiftExchange.managerId? | User | SetNull | `shiftExchangesManaged ShiftExchange[]` |
| ReplacementOffer.absentEmployeeId | Employee | Restrict | `replacementOffersAbsent ReplacementOffer[]` |
| ReplacementOffer.absenceId? | AbsenceDeclaration | SetNull | `replacementOffers ReplacementOffer[]` |
| ReplacementOffer.filledByEmployeeId? | Employee | SetNull | `replacementOffersFilled ReplacementOffer[]` |
| ShiftMarketListing.posterId | Employee | Restrict | `marketListingsPosted ShiftMarketListing[]` |
| ShiftMarketListing.shiftId | Shift | Cascade | `marketListings ShiftMarketListing[]` |
| ShiftMarketListing.storeId | Store | Restrict | `marketListings ShiftMarketListing[]` |
| ShiftMarketListing.claimantId? | Employee | SetNull | `marketListingsClaimed ShiftMarketListing[]` |
| ShiftMarketListing.managerId? | User | SetNull | `marketListingsManaged ShiftMarketListing[]` |

> Note : chaque ajout nécessite **les deux côtés** (champ relation + champ
> inverse `[]` sur le modèle parent). Les noms inverses ci-dessus évitent les
> collisions (plusieurs relations vers Employee/Shift dans le même modèle →
> noms de relation explicites requis : `@relation("ExchangeRequester")`, etc.).

## 3. Pré-vol — détection d'orphelins (à exécuter par ops, lecture seule)

```sql
-- Chaque requête doit renvoyer 0. Sinon → nettoyer (section 4) AVANT la migration.
SELECT count(*) AS x1 FROM "ShiftExchange" e
  LEFT JOIN "Employee" emp ON emp.id = e."requesterId" WHERE emp.id IS NULL;
SELECT count(*) AS x2 FROM "ShiftExchange" e
  LEFT JOIN "Employee" emp ON emp.id = e."targetId" WHERE emp.id IS NULL;
SELECT count(*) AS x3 FROM "ShiftExchange" e
  LEFT JOIN "Shift" s ON s.id = e."requesterShiftId" WHERE s.id IS NULL;
SELECT count(*) AS x4 FROM "ReplacementOffer" r
  LEFT JOIN "Employee" emp ON emp.id = r."absentEmployeeId" WHERE emp.id IS NULL;
SELECT count(*) AS x5 FROM "ShiftMarketListing" m
  LEFT JOIN "Employee" emp ON emp.id = m."posterId" WHERE emp.id IS NULL;
SELECT count(*) AS x6 FROM "ShiftMarketListing" m
  LEFT JOIN "Shift" s ON s.id = m."shiftId" WHERE s.id IS NULL;
SELECT count(*) AS x7 FROM "ShiftMarketListing" m
  LEFT JOIN "Store" st ON st.id = m."storeId" WHERE st.id IS NULL;
```

## 4. Migration auto-réparatrice (nullables → NULL ; non-nullables orphelins → suppression)

```sql
-- Nullables : neutraliser les refs cassées (non destructif sur l'enregistrement).
UPDATE "ShiftExchange" e SET "targetShiftId" = NULL
  WHERE "targetShiftId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Shift" s WHERE s.id = e."targetShiftId");
UPDATE "ShiftExchange" e SET "managerId" = NULL
  WHERE "managerId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = e."managerId");
-- (idem ReplacementOffer.absenceId/filledByEmployeeId ; ShiftMarketListing.claimantId/managerId)

-- Non-nullables orphelins : enregistrements déjà cassés (réf inexistante) → DELETE.
-- DÉCISION OPS : ces lignes sont déjà invalides (pointent vers une entité supprimée).
DELETE FROM "ShiftExchange" e
  WHERE NOT EXISTS (SELECT 1 FROM "Employee" emp WHERE emp.id = e."requesterId")
     OR NOT EXISTS (SELECT 1 FROM "Employee" emp WHERE emp.id = e."targetId")
     OR NOT EXISTS (SELECT 1 FROM "Shift" s WHERE s.id = e."requesterShiftId");
-- (idem ReplacementOffer sur absentEmployeeId ; ShiftMarketListing sur posterId/shiftId/storeId)

-- Puis ADD CONSTRAINT pour chaque FK (généré par `prisma migrate dev` une fois
-- le schéma section 2 en place). Exemple :
-- ALTER TABLE "ShiftMarketListing" ADD CONSTRAINT "ShiftMarketListing_shiftId_fkey"
--   FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

## 5. Procédure d'application (ops)

1. Exécuter §3 sur la prod. Si tous = 0 → aller en 3.
2. Sinon, exécuter §4 (revue de la décision DELETE par un responsable).
3. Appliquer le schéma §2 (`@relation` + inverses) puis `prisma migrate deploy`
   (ou `db push`). Le build Vercel valide la compilation du client généré.
4. Vérifier : créer/supprimer un Shift → les `ShiftMarketListing`/`ShiftExchange`
   liés se comportent selon §2 (Cascade/SetNull).

## 6. Pourquoi pas appliqué en session

Pas d'accès DB → impossible d'exécuter le pré-vol §3. Appliquer à l'aveugle via
`db push` casserait le déploiement si des orphelins existent. **PosTimeClock
reste volontairement sans relation** (résilience POS). Tout le reste est prêt
ci-dessus.

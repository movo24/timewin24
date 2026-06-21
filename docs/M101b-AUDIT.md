# M101b — Audit statique : montants € hors paie encore en `Float`

> Audit **sans code** demandé avant toute migration. Le noyau paie (`CountryConfig`,
> `EmployeeCost`) est déjà passé en `Decimal` (M101). Ce document inventorie le **reste**,
> son usage, l'impact, une proposition de migration, les tests et le **risque**.
> **Aucune migration blindée** : les lots à risque moyen/élevé exigent un jeu de données de
> test pour vérifier la parité (agrégations analytics/IA) — non disponible en session.

## Méthode de référence (identique à M101)
Pour chaque champ converti : `Float → Decimal` (€ = `@db.Decimal(12,2)`, taux/% = `@db.Decimal(6,4)`),
frontière `Decimal→number` via `src/lib/decimal.ts` (`toNum`/`toNumN`) aux **sites de calcul**,
et **coercition en `number` aux sites de sérialisation** pour préserver le contrat JSON
(le front lit des nombres → zéro changement front). Le piège non couvert par `tsc` :
`NextResponse.json(decimal)` sérialise une **chaîne**, pas un nombre → chaque réponse doit
être recoercée et **vérifiée** (idéalement avec données).

## Classification (ce qui est en jeu vs ce qui ne l'est PAS)
**Vrais montants € / taux à convertir** (ci-dessous). **À NE PAS convertir** (rester `Float`) :
GPS (`latitude`/`longitude`/`accuracy`/`distanceMeters`), heures (`weeklyHours`, `workedHours`,
`workingHours`, `totalHours`, `maxHoursPer*`, `minRestBetween`), dimensions (`widthMm`/`heightMm`),
ratios non monétaires (`upsellRate`) et **tous les `*Score`** 0-100 (`performanceScore`,
`salesScore`, `productivityScore`, `riskScore`, etc. — métriques, pas de l'argent).

---

## LOT A — Taux & plafonds (% / coefficients) — risque **FAIBLE**

| Champ | Modèle | Type cible | Usage | Impact |
|---|---|---|---|---|
| `vatRate` | `Store` | `Decimal(6,4)` | TVA par défaut magasin ; lu en config/feed POS | Faible : peu de calcul, surtout affichage/transport |
| `vatRate` | `Product` | `Decimal(6,4)` | TVA produit ; POS feed/store-config, catalogue | Faible/moyen : display + éventuel calcul TTC côté POS |
| `maxDiscountPct` | `Employee` | `Decimal(5,2)` | Plafond remise vendeur ; lu dans `buildPosPermissions` (`auth/employee-login`) | Faible : seuil de politique, comparé/affiché |

- **Migration** : additive (ALTER TYPE … USING ::numeric ; prod sans données → trivial).
- **Sites** : `pos-feed/store-config`, `pos-feed/store-schedules`, `auth/employee-login`,
  routes `products`. Recoercition à la sérialisation + `toNum` aux rares comparaisons.
- **Tests** : sérialisation (forme number préservée) ; un test de `buildPosPermissions`
  avec `maxDiscountPct` Decimal.
- **Risque : FAIBLE** — petite surface, peu d'arithmétique. **Faisable sans données.**

## LOT B — Catalogue produits & étiquettes — risque **MOYEN**

| Champ | Modèle | Type cible | Usage |
|---|---|---|---|
| `price`, `oldPrice` | `Product` | `Decimal(12,2)` | Prix catalogue ; écrit par sync POS + import inventaire + édition ; lu dans routes `products`, génération étiquettes |
| `priceAtPrint` | `LabelPrintItem` | `Decimal(12,2)` | Snapshot du prix au moment de l'impression ; écrit `labels/print`, lu par `pdf-generator`/`zpl-generator`/`print-history` |

- **Sites consommateurs** : `products/route.ts`, `products/[id]/route.ts`,
  `products/import-from-inventory`, `labels/print`, `labels/pdf-generator`,
  `labels/zpl-generator`, `components/labels/*` (catalogue, print-history, label-printer).
- **Impact** : sérialisation vers l'UI catalogue (qui fait `.toFixed()`), et **formatage
  prix dans les générateurs PDF/ZPL** — point à vérifier (un `Decimal` a `.toFixed()` mais
  le flux de type change ; risque de `String(price)` produisant un format inattendu).
- **Migration** : additive. Frontière + serializers `Product`/`LabelPrintItem`.
- **Tests** : rendu prix PDF/ZPL (format `12.50`), sérialisation routes `products`,
  parité d'affichage catalogue.
- **Risque : MOYEN** — bornée mais touche l'impression (sortie binaire/texte difficile à
  vérifier sans exécuter). **Faisable mais à vérifier sur un produit de test.**

## LOT C — Ventes POS (`PosSalesData`) — risque **ÉLEVÉ**

| Champ | Modèle | Type cible | Usage |
|---|---|---|---|
| `revenue`, `cardAmount`, `cashAmount`, `otherAmount` | `PosSalesData` | `Decimal(12,2)` | CA et répartition paiements par créneau ; **écrit** par ingestion webhook POS + `sync-engine` ; **agrégé** massivement (SUM, ratios, moyennes) en analytics + IA |

- **Sites consommateurs** (arithmétique lourde) : `pos/sync-engine`, `analytics/performance-aggregator`,
  `ai-engine/pos-analysis/data-collector`, `ai-engine/performance/pos-correlator`,
  `ai-engine/anomaly/detector`, `api/analytics/hourly`, `api/analytics/dashboard`,
  `api/pos-events/webhook`, `api/ai/test`.
- **Impact** : c'est la **plus grande surface d'arithmétique** du domaine argent — sommes,
  corrélations IA, détection d'anomalies, ratios CA/heure. Convertir en `Decimal` force soit
  une arithmétique Decimal, soit `toNum` à **chaque** site de calcul. Une erreur de frontière
  → dérive silencieuse des analytics/anomalies.
- **Migration** : additive côté schéma, mais **réécriture de tous les agrégateurs** à la frontière.
- **Tests** : **parité obligatoire** — comparer sommes/ratios/anomalies Float vs Decimal sur un
  **jeu de ventes représentatif** (indispensable). Sans données, non vérifiable → **ne pas faire en aveugle**.
- **Risque : ÉLEVÉ** — **bloqué sur un jeu de données de test.**

## LOT D — Performance employé agrégée — risque **MOYEN-ÉLEVÉ**

| Champ | Modèle | Type cible | Usage |
|---|---|---|---|
| `totalSales`, `avgBasket`, `cashAmount`, `cardAmount`, `salesPerHour` | `EmployeePerformanceDaily` | `Decimal(12,2)` | Agrégats journaliers **calculés** par `performance-aggregator` à partir de `PosSalesData` |
| `sales` | `EmployeePerformanceHourly` | `Decimal(12,2)` | Idem, horaire |

- **Sites** : `analytics/performance-aggregator` (écriture), `analytics/alerts-detector`,
  `api/analytics/employees(/[id])`, `api/analytics/dashboard`, `api/dashboard`.
- **Impact** : métriques **dérivées** (reporting), pas un registre source. La valeur d'exactitude
  est moindre que LOT C, mais l'agrégation + sérialisation reste à recâbler.
- **Dépendance** : ces valeurs dérivent de `PosSalesData` → **cohérent de traiter D après C**
  (même jeu de données de parité).
- **Risque : MOYEN-ÉLEVÉ** — **dépend de C + jeu de données.**

---

## Séquencement recommandé
1. **LOT A** (taux/% ) — risque faible, faisable sans données. *(Inclut `maxDiscountPct`, utile
   au passage pour l'enforcement remises.)*
2. **LOT B** (catalogue/étiquettes) — faisable, à vérifier sur produit de test (impression).
3. **LOT C** (ventes POS) — **gaté** : nécessite un jeu de ventes pour parité analytics/IA.
4. **LOT D** (perf agrégée) — après C, même jeu de données.

## Ce qu'il me faut pour débloquer C/D (sans aveugle)
- Soit un **jeu de données de test** (ventes POS représentatives) pour exécuter une **parité**
  Float↔Decimal sur sommes/ratios/anomalies ;
- soit un **feu vert explicite** pour appliquer A/B seulement maintenant, et différer C/D.

> Statut : audit livré. **LOT A+B EXÉCUTÉS** (migration `20260621120000`, `money-serialize.ts`, tsc 0 / jest 118 ; runtime non vérifié). **LOT C+D restent gatés** sur un jeu de données de parité.

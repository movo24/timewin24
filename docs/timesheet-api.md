# Timesheet API — Documentation V1

> **Branche** : `feat/timesheet-api`
> **Statut** : backend complet, testé (146 tests dédiés, 492/492 suite projet).
> **Pas encore mergé sur `appstore-saas`** au moment de la rédaction.

---

## 1. Vue d'ensemble

Le module Timesheet calcule **à la volée** (aucun nouveau modèle Prisma, aucune migration) les heures prévues, pointées, l'écart, les retards, les absences validées, les heures supplémentaires et le coût brut estimé pour une période donnée.

### Architecture (4 étages séparés)

```
calc.ts       (math pure, no I/O)
   ↓
query.ts      (Prisma read-only, multi-tenant scoped)
   ↓
aggregate.ts  (transformation métier par période/groupBy)
today.ts      (transformation métier vue "aujourd'hui")
   ↓
3 route handlers (HTTP + auth + RBAC + Zod)
```

### Sources de données utilisées

| Modèle Prisma | Rôle |
|---|---|
| `Shift` | heures prévues |
| `ClockIn` | heures pointées + retards |
| `AbsenceDeclaration` (statut `APPROVED` uniquement) | absences |
| `Employee` (+ `EmployeeCost` left join) | identité, weeklyHours contractuelles, taux horaire brut |
| `Store` | nom, code, ville, timezone |

**Aucun champ sensible côté employé n'est exposé** (pas d'email, GPS, photo de pointage, etc.).

---

## 2. Endpoints

### 2.1 `GET /api/timesheet`

Endpoint principal. Agrège la timesheet sur une période avec un `groupBy` configurable.

**Query params**

| Param | Type | Obligatoire | Notes |
|---|---|---|---|
| `dateFrom` | string `YYYY-MM-DD` | ✅ | Inclusif |
| `dateTo` | string `YYYY-MM-DD` | ✅ | Inclusif. Max range = **92 jours**. |
| `storeId` | cuid | ❌ | Filtre 1 magasin. Pour MANAGER doit être dans son scope. |
| `employeeId` | cuid | ❌ | Filtre 1 employé. Pour EMPLOYEE forcé à son propre ID. |
| `groupBy` | `employee` / `store` / `day` / `week` | ❌ | Défaut `employee`. |
| `includeAnomalies` | `true` / `false` | ❌ | Défaut `false`. |
| `currency` | `EUR` | ❌ | V1 EUR uniquement. |

**Codes retour**

| Code | Cas |
|---|---|
| 200 | OK |
| 400 | Validation Zod (dates invalides, range > 92j, format slashes, mois 13, etc.) |
| 401 | Non authentifié |
| 403 | MANAGER avec `storeId` hors scope ; EMPLOYEE sans employee lié |
| 500 | Erreur serveur (DB, etc.) |

**Réponse simplifiée**

```json
{
  "meta": {
    "companyId": "cmp...",
    "dateFrom": "2026-05-11",
    "dateTo": "2026-05-17",
    "daysCount": 7,
    "groupBy": "employee",
    "storesScope": null,
    "generatedAt": "2026-05-16T14:30:00.000Z",
    "currency": "EUR"
  },
  "totals": {
    "plannedMinutes": 5040,
    "unassignedPlannedMinutes": 480,
    "workedMinutes": 4920,
    "inProgressMinutes": 0,
    "breakMinutesEstimated": 180,
    "netWorkedMinutes": 4740,
    "varianceMinutes": -300,
    "lateMinutesTotal": 25,
    "absencesDays": 1,
    "overtimeMinutes": 0,
    "estimatedGrossCost": 985.50
  },
  "rows": [
    {
      "employeeId": "cemp...",
      "employeeCode": "EMP-001",
      "firstName": "Alice",
      "lastName": "Martin",
      "contractType": "CDI",
      "weeklyHours": 35,
      "hourlyRateGross": 12,
      "plannedMinutes": 2100,
      "unassignedPlannedMinutes": 0,
      "workedMinutes": 2040,
      "varianceMinutes": -90,
      "lateMinutesTotal": 5,
      "absencesDays": 0,
      "overtimeMinutes": 0,
      "estimatedGrossCost": 408,
      "shiftsCount": 5,
      "clockInsCount": 5,
      "absencesCount": 0
    }
  ],
  "anomalies": [
    {
      "type": "LATE",
      "severity": "INFO",
      "date": "2026-05-13",
      "employeeId": "cemp...",
      "shiftId": "csft...",
      "clockInId": "cci...",
      "message": "Retard de 5 min"
    }
  ]
}
```

**Formes alternatives de `rows` selon `groupBy`**

| `groupBy` | Champs spécifiques de la row |
|---|---|
| `employee` | `employeeId`, `employeeCode`, `firstName`, `lastName`, `contractType`, `weeklyHours`, `hourlyRateGross`, `shiftsCount`, `clockInsCount`, `absencesCount` |
| `store` | `storeId`, `storeName`, `storeCode`, `shiftsCount`, `clockInsCount` |
| `day` | `date` (YYYY-MM-DD), `shiftsCount`, `clockInsCount` |
| `week` | `weekStart` (lundi ISO 8601), `weekEnd` (dimanche), `shiftsCount`, `clockInsCount` |

---

### 2.2 `GET /api/timesheet/employees/[id]`

Raccourci pour la timesheet d'un seul employé. `employeeId` est dans l'URL, `groupBy` est implicite à `employee`.

**Path params**

| Param | Type | Notes |
|---|---|---|
| `id` | cuid | Validé par Zod |

**Query params**

| Param | Type | Obligatoire | Notes |
|---|---|---|---|
| `dateFrom` | `YYYY-MM-DD` | ✅ | |
| `dateTo` | `YYYY-MM-DD` | ✅ | Max 92 jours |
| `includeAnomalies` | `true` / `false` | ❌ | |

Pas de `groupBy` ni `storeId` (ignorés s'ils sont passés).

**Codes retour**

| Code | Cas |
|---|---|
| 200 | OK |
| 400 | Validation Zod, ID invalide |
| 401 | Non authentifié |
| 403 | EMPLOYEE accédant à un autre employee ; MANAGER hors intersection stores ; EMPLOYEE sans employee lié |
| 404 | Employé inexistant **ou cross-company** (masking volontaire) |

**Réponse simplifiée**

```json
{
  "meta": {
    "companyId": "cmp...",
    "dateFrom": "2026-05-11",
    "dateTo": "2026-05-17",
    "daysCount": 7,
    "generatedAt": "2026-05-16T...",
    "currency": "EUR",
    "employeeId": "cemp..."
  },
  "employee": {
    "id": "cemp...",
    "employeeCode": "EMP-001",
    "firstName": "Alice",
    "lastName": "Martin",
    "contractType": "CDI",
    "weeklyHours": 35,
    "hourlyRateGross": 12
  },
  "totals": { /* mêmes champs que /api/timesheet */ },
  "anomalies": [ /* si includeAnomalies=true */ ]
}
```

L'objet `employee` est à la racine (pas dans `rows[]`) pour ergonomie UI.

---

### 2.3 `GET /api/timesheet/today`

Snapshot temps réel pour dashboard manager. Pas de période — force "aujourd'hui" (UTC V1).

**Query params**

| Param | Type | Obligatoire | Notes |
|---|---|---|---|
| `storeId` | cuid | ❌ | Filtre 1 magasin (MANAGER doit l'avoir en scope) |
| `currency` | `EUR` | ❌ | |

Pas de `dateFrom` / `dateTo` / `groupBy` / `includeAnomalies` (structure fixe).

**Codes retour**

| Code | Cas |
|---|---|
| 200 | OK |
| 400 | Validation Zod, SUPER_ADMIN sans companyId |
| 401 | Non authentifié |
| 403 | **EMPLOYEE refusé** (endpoint manager-only) ; MANAGER avec storeId hors scope |

**Réponse simplifiée**

```json
{
  "meta": {
    "companyId": "cmp...",
    "date": "2026-05-16",
    "storesScope": null,
    "generatedAt": "2026-05-16T14:30:00.000Z",
    "currency": "EUR"
  },
  "summary": {
    "storesActive": 2,
    "shiftsPlanned": 8,
    "shiftsCovered": 6,
    "shiftsUncovered": 2,
    "clockInsTotal": 7,
    "clockInsOpen": 3,
    "plannedMinutes": 3120,
    "workedMinutes": 1980,
    "inProgressMinutes": 0,
    "lateMinutesTotal": 12,
    "coverageRate": 0.75,
    "absencesApproved": 1
  },
  "stores": [
    {
      "storeId": "csta...",
      "storeName": "Paris Demo",
      "storeCode": "PAR-001",
      "shiftsPlanned": 5,
      "shiftsCovered": 4,
      "clockInsOpen": 2,
      "plannedMinutes": 1860,
      "workedMinutes": 1200,
      "lateCount": 1,
      "presentNow": [
        { "employeeId": "cemp...", "firstName": "Alice", "lastName": "Martin" }
      ]
    }
  ],
  "alerts": [
    {
      "type": "LATE",
      "severity": "INFO",
      "employeeId": "cemp...",
      "storeId": "csta...",
      "shiftId": "csft...",
      "clockInId": "cci...",
      "message": "Retard de 12 min"
    }
  ]
}
```

**`presentNow`** : uniquement `employeeId`, `firstName`, `lastName`. Pas d'email, pas de GPS, pas de photo (PII filter strict).

**Types d'alerts** :
- `CLOCKIN_NOT_CLOSED` (`CRITICAL`) — pointage ouvert depuis > 12h
- `LATE` (`INFO`) — `lateMinutes > 0`

Pas de `SHIFT_WITHOUT_CLOCKIN` ici (la journée est en cours, prématuré).

---

## 3. RBAC par rôle

| Rôle | `/api/timesheet` | `/employees/[id]` | `/today` |
|---|---|---|---|
| **Non-auth** | 401 | 401 | 401 |
| **SUPER_ADMIN** sans companyId | 400 | 400 | 400 |
| **SUPER_ADMIN** avec companyId | OK toute la company | OK toute la company | OK toute la company |
| **OWNER** | OK toute la company | OK toute la company | OK toute la company |
| **ADMIN** | OK toute la company | OK toute la company | OK toute la company |
| **MANAGER** | Stores liés via `StoreEmployee` ; `storeId` hors scope → 403 | OK si employé ∈ scope stores ; sinon 403 | Idem, refus si storeId hors scope |
| **EMPLOYEE** | `employeeId` forcé à soi ; `hourlyRateGross` et `estimatedGrossCost` masqués (null) | OK uniquement self ; sinon 403 | **403 refusé** |

### Garantie multi-tenant

- Aucun query Prisma sans `companyId` (issu de la session, jamais d'un query param)
- Cross-company → 404 masking sur `/employees/[id]` (ne révèle pas l'existence)
- 29 tests d'intégration RBAC verrouillent ce comportement (cf. `src/__tests__/timesheet-api.test.ts`)

---

## 4. Champs importants

| Champ | Définition | Unité |
|---|---|---|
| `plannedMinutes` | Σ durée des Shifts dans la période | minutes |
| `unassignedPlannedMinutes` | Σ Shifts **sans employeeId** (exclus de `groupBy=employee` rows) | minutes |
| `workedMinutes` | Σ `(clockOutAt - clockInAt)` (clos uniquement, cap 24h) | minutes |
| `inProgressMinutes` | V1 toujours 0 (info via `clockInsOpen` + `presentNow`) | minutes |
| `breakMinutesEstimated` | Estimation : 30 min si shift > 6h | minutes |
| `netWorkedMinutes` | `workedMinutes - breakMinutesEstimated` | minutes |
| `varianceMinutes` | `netWorkedMinutes - plannedMinutes` (négatif = sous-pointage) | minutes |
| `lateMinutesTotal` | Σ `ClockIn.lateMinutes` | minutes |
| `absencesDays` | Σ jours d'absence APPROVED chevauchant la période | jours |
| `overtimeMinutes` | V1 informatif : pointé - weeklyHours par semaine ISO | minutes |
| `estimatedGrossCost` | `(workedMinutes / 60) × hourlyRateGross`, arrondi 2 décimales | EUR (V1) |
| `coverageRate` | `/today` : `shiftsCovered / shiftsPlanned` (0..1) | ratio |
| `absencesApproved` | `/today` : nb employés distincts en absence aujourd'hui | nombre |
| `presentNow` | `/today` : employés avec clockIn ouvert (nom complet seulement) | liste |

### Anomalies (4 types)

| Type | Severity | Déclenche si |
|---|---|---|
| `CLOCKIN_NOT_CLOSED` | CRITICAL | ClockIn `clockOutAt=null` et > 24h ouvert (12h sur `/today`) |
| `SHIFT_WITHOUT_CLOCKIN` | WARNING | Shift passé (`date < today`) sans ClockIn lié. **Pas sur `/today`** |
| `CLOCKIN_WITHOUT_SHIFT` | INFO | ClockIn avec `shiftId=null` |
| `LATE` | INFO | `lateMinutes > 0` |

---

## 5. Limitations V1 (documentées, à corriger V2)

| Limite | Impact | Voie V2 |
|---|---|---|
| Timezone **UTC** uniquement | Décalages possibles en multi-pays | Utiliser `Store.timezone` |
| Coût **brut** uniquement | Pas un vrai calcul de paie | Inclure charges patronales via `EmployeeCost.employerRateOverride` |
| Pas de **charges patronales** | Approximation coût employeur | V2 |
| Pas de **validation pointage** par manager | Pas de workflow correction | Nouvel endpoint `POST /api/timesheet/validate-clockin/[id]` |
| Pas d'**export CSV** | Doit copier-coller | `GET /api/timesheet/export.csv` |
| `/today` réservé manager | Pas de "self today" pour employee | Acceptable V1 (employé a `/mon-planning`) |
| `overtimeMinutes` calculé sur **semaine ISO complète** | Range partiel donne info biaisée | Doc utilisateur claire |
| **Cross-company SUPER_ADMIN** non supporté | SUPER_ADMIN doit choisir une company en session | Picker UI + cross-company V2 |
| **CLOCKIN_NOT_CLOSED** ne capte pas hier ouvert sur `/today` | Pointages oubliés veille passent sous radar | Fetch yesterday's open clock-ins aussi |

---

## 6. Notes pour future UX mobile (branche `feat/mobile-manager-ux`)

### Mapping endpoints → pages

| Page mobile | Endpoint | Notes |
|---|---|---|
| **"Aujourd'hui Manager"** (page d'accueil mobile) | `GET /api/timesheet/today` | Affiche `summary`, `stores[]` cards, `alerts[]` |
| **"Mon équipe cette semaine"** | `GET /api/timesheet?groupBy=employee&dateFrom=lundi&dateTo=dimanche` | Lundi ISO 8601, calcul côté front |
| **"Fiche employé"** (touch sur un employé) | `GET /api/timesheet/employees/[id]?dateFrom=...&dateTo=...` | Objet `employee` à la racine, totaux ready-to-display |
| **"Mon timesheet"** (vue EMPLOYEE de soi) | `GET /api/timesheet/employees/[mon_id]?...` | Money fields seront `null` automatiquement |

### Best practices côté UI

- Toujours convertir minutes → "HHhMM" via `formatMinutesAsHours()` (déjà dispo dans `calc.ts`)
- Afficher `presentNow.length` plutôt que la liste sur mobile (espace écran limité)
- Couleur de `varianceMinutes` : rouge si < 0, vert si > 0
- `coverageRate` : afficher en `%` (`× 100`)
- Si `estimatedGrossCost === null`, afficher "—" ou "Coût non configuré"
- Si `hourlyRateGross === null` (mode EMPLOYEE), ne pas afficher les colonnes money

### Pagination / volumes attendus

- V1 : limite hard 92 jours par requête, pas de pagination
- ~50 stores × 500 employés × 30 jours = ~75 000 shifts → réponse sous 2s
- Si volumes plus grands : V2 implémenter pagination ou GraphQL cursor

---

## 7. Tests

| Fichier | Tests | Type |
|---|---|---|
| `src/__tests__/timesheet-calc.test.ts` | 74 | Unit pur |
| `src/__tests__/timesheet-aggregate.test.ts` | 27 | Unit pur (fixtures injectées) |
| `src/__tests__/timesheet-today.test.ts` | 16 | Unit pur (fixtures injectées) |
| `src/__tests__/timesheet-api.test.ts` | 29 | Intégration (mock Prisma + session) |
| **Total** | **146** | |

Suite complète projet : **492/492 tests passent** en ~3.5s.

---

## 8. Roadmap

| Item | Statut |
|---|---|
| `/api/timesheet` principal | ✅ V1 |
| `/api/timesheet/employees/[id]` | ✅ V1 |
| `/api/timesheet/today` | ✅ V1 |
| Tests unit + intégration RBAC | ✅ V1 |
| Cette doc | ✅ V1 |
| Page mobile "Aujourd'hui Manager" | 🟧 prochaine (branche `feat/mobile-manager-ux`) |
| Export CSV `/api/timesheet/export.csv` | ❌ V2 |
| Validation pointage `POST /validate-clockin/[id]` | ❌ V2 |
| Timezone per-store | ❌ V2 |
| Cross-company SUPER_ADMIN | ❌ V2 |
| Coût employeur complet | ❌ V2 |

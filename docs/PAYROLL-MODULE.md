# Module Paie / DSN / Bulletins — Spécification & diagnostic

> **Frontière non négociable** : TimeWin24 produit des **faits horaires bruts
> qualifiés** (quantités), **jamais** des éléments de rémunération valorisés.
> Aucun euro, aucun taux de majoration, aucune cotisation, aucun net/brut.
> La valorisation reste au moteur de paie externe / expert-comptable.

## 1. Diagnostic de l'existant (Étage 1 — TimeWin24 Core)

Faits horaires qualifiés déjà disponibles :

| Fait | Modèle Prisma | Champs utiles |
|---|---|---|
| Heures planifiées | `Shift` | `date`, `startTime`, `endTime`, `employeeId`, `storeId` |
| Heures réelles + retards | `ClockIn` | `clockInAt`, `clockOutAt`, `status` (ON_TIME/LATE/ABSENT), `lateMinutes`, `shiftId` |
| Absences / congés / arrêts | `AbsenceDeclaration` | `type` (MALADIE/CONGE/PERSONNEL/ACCIDENT/AUTRE), `startDate`, `endDate`, `status` |
| Contrat (partiel) | `Employee` | `weeklyHours`, `contractType` (CDI/CDD/INTERIM/EXTRA/STAGE), `employeeCode` |
| Établissement | `Store` | `storeCode`, `unit` → `organization` |
| Société | `Organization` | **`siret`, `siren`**, `legalName` |

**Manques identifiés pour la granularité `société × établissement × contrat × période` :**
1. Pas de **SIRET au niveau établissement** (`Store`) — seul `Organization` porte un SIRET. La DSN raisonne par établissement (SIRET = SIREN + NIC).
2. Pas d'entité **contrat** explicite : un salarié peut avoir plusieurs contrats / établissements ; le raisonnement paie est **par contrat**, pas par salarié. `Employee.contractType` est insuffisant.
3. Pas de qualification **dimanche / jour férié** (le dimanche est dérivable de la date ; les fériés nécessitent un calendrier).
4. Pas de logique **heures sup / complémentaires** (seuils, contingent).
5. Pas d'entité **période de paie** / **Payroll Inputs** ni de verrouillage mensuel.

## 2. Moteur de qualification (LIVRÉ — Tier-1, pur, sans DB)

`src/lib/payroll/` — fonctions **pures**, testées, **sans euro** :

- `holidays.ts` — `computeEaster`, `frenchHolidays(year)`, `isFrenchHoliday(date)` (11 fériés légaux FR, mobiles via Pâques).
- `hours.ts` — `intervalHours`, `isSunday`, `dayOfWeek`, `round2`.
- `qualify.ts` — `weekStart`, `qualifyWeeklyHours(worked, contrat)` : seuil légal **35 h/semaine** → normal / heures sup (temps plein) / heures complémentaires (temps partiel). **Qualification uniquement, aucune majoration.**
- `aggregate.ts` — `aggregatePayrollInputs(input)` → `PayrollInputVariables` (quantités) par contrat × période : heures normales/sup/complémentaires, dimanche, férié, absences par type (congés / arrêts / autres), retards.
- `types.ts` — `PayrollKey` (société×établissement×contrat×période), `PayrollInputVariables`.

**Limite connue documentée** : les heures sup sont qualifiées par **semaine** (lundi→dimanche) puis sommées. Une semaine à cheval sur deux mois est qualifiée avec les seuls faits fournis par l'appelant (qui borne la période). Raffinement « semaine calendaire complète inter-mois » en backlog.

Tests : `payroll-holidays` (8), `payroll-qualify` (11+), `payroll-aggregate` (8). Tous verts, tsc 0.

## 3. Schéma DB (Tier-2 — **EXÉCUTÉ** après GO migration)

> ✅ **Exécuté** (GO migration reçu). Les trois modèles ci-dessous ont été ajoutés
> à `schema.prisma` (additif, 100 % nouvelles tables, aucune table existante
> modifiée). Application en base via `prisma db push` au déploiement.
> Rollback : revert du commit schéma + `prisma generate` ; les tables additives
> vides sont inoffensives.

```prisma
// Établissement : SIRET propre (NIC) rattaché au Store existant.
model Establishment {
  id          String   @id @default(cuid())
  store       Store    @relation(fields: [storeId], references: [id], onDelete: Restrict)
  storeId     String   @unique
  siret       String   @unique // SIREN(9) + NIC(5)
  legalName   String?
  apeCode     String?  // code APE/NAF
  createdAt   DateTime @default(now())
  contracts   EmploymentContract[]
}

// Contrat de travail : la vraie clé du raisonnement paie.
model EmploymentContract {
  id              String        @id @default(cuid())
  employee        Employee      @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  employeeId      String
  establishment   Establishment @relation(fields: [establishmentId], references: [id], onDelete: Restrict)
  establishmentId String
  contractType    ContractType  // réutilise l'enum existant
  weeklyHours     Float         // base contractuelle
  startDate       DateTime      @db.Date
  endDate         DateTime?     @db.Date
  createdAt       DateTime      @default(now())
  payrollInputs   PayrollInput[]
  @@index([employeeId])
  @@index([establishmentId])
}

// Étage 2 — variables de paie mensuelles validées (QUANTITÉS, jamais d'euros).
model PayrollInput {
  id                 String   @id @default(cuid())
  contract           EmploymentContract @relation(fields: [contractId], references: [id], onDelete: Restrict)
  contractId         String
  period             String   // "YYYY-MM"
  // quantités qualifiées
  normalHours        Float    @default(0)
  overtimeHours      Float    @default(0)
  complementaryHours Float    @default(0)
  sundayHours        Float    @default(0)
  holidayHours       Float    @default(0)
  paidLeaveDays      Float    @default(0)
  sickOrAccidentDays Float    @default(0)
  otherAbsenceDays   Float    @default(0)
  latenessMinutes    Int      @default(0)
  // saisies manuelles non valorisées (références)
  manualEntries      Json?    // primes/acomptes SAISIS (libellé + référence), valorisés côté paie
  // statut & verrouillage (logique de lock = Tier-2)
  status             String   @default("draft") // draft | validated | locked
  validatedAt        DateTime?
  lockedAt           DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@unique([contractId, period]) // anti-doublon : une ligne par contrat × période
  @@index([period])
}
```

**Note granularité société** : `EmploymentContract → Establishment → Store → Unit → Organization` fournit déjà société (SIREN) + établissement (SIRET). Pas de duplication.

## 4. Étages suivants — statut

- **Étage 3 — Payroll Export** (CSV/XLSX/JSON) : exporteur **abstrait** Tier-1 ; **format concret** (Silae/Sage/Cegid/PayFit/ADP) = décision produit **Tier-2**.
- **Étage 4 — Payslip Vault** : entités + ACL + chiffrement + audit. Stockage de PDF salariés = données sensibles ; squelette Tier-1, écritures de données réelles = Tier-2.
- **Étage 5 — DSN Layer** : **squelette d'entités uniquement** (Tier-1) ; tout dépassement = Tier-2. Feature flag **`dsn_submission_enabled = false`** obligatoire. Dépôt réel = **Tier-3 (jamais l'agent)**.

## 5. Statut Tier-2

1. ✅ **Migration du schéma (§3) exécutée** (GO reçu) — tables additives `Establishment` / `EmploymentContract` / `PayrollInput`.
2. ✅ **Persistance + cycle de statut** `draft → validated → locked` avec garde anti-doublon (`@@unique([contractId, period])`) et provisioning idempotent (pas d'établissement/contrat en double). Le verrou `locked` bloque toute réécriture mais ne détruit aucune donnée (réversible côté admin).
3. ⏳ **DSN Layer au-delà du squelette d'entités** — toujours Tier-2 (non entamé).
4. ⏳ Choix d'un **format de mapping paie concret** (Silae/Sage/…) — toujours Tier-2.
5. ⛔ Dépôt réel DSN / envoi Urssaf-Agirc-Arrco — **Tier-3 (jamais l'agent)**.

## 6. Sources de temps — clarification (M5)

Deux enregistrements de temps coexistent dans TimeWin24 :

| Source | Modèle | Alimentation | Rôle |
|---|---|---|---|
| **Pointage app** | `ClockIn` | app employé / backoffice / attendance API | **SOURCE AUTORITAIRE POUR LA PAIE** (Étage 2). `source.ts` → `workedFactsFromClockIns` lit `ClockIn`. |
| Pointage POS | `PosTimeClock` | sync POS (`pos-events/webhook`, `sync-engine`) | Présence côté caisse ; analytics/contrôle POS. **N'alimente PAS la paie.** |

**Décision figée** : la paie ne lit QUE `ClockIn`. `PosTimeClock` est une source parallèle
d'observation POS ; l'analytics les lit séparément (aucune écriture de l'une vers l'autre).

⚠️ **Non réconciliées** : il n'existe pas de fusion `PosTimeClock → ClockIn`. Si un
pointage effectué à la caisse doit compter dans la paie, il faut décider d'un pont
explicite (POS `session.opened` → `ClockIn`). C'est une **décision produit (Tier-2)** :
elle change ce qui est payé. Non implémentée volontairement.

## 7. Identité contrat preview ↔ persistance (M6)

`GET /api/payroll/preview` (live, lecture seule) et la persistance (`EmploymentContract`)
parlent désormais le **même langage** : les deux exposent `employeeId` (clé commune) et
`contractId`. La preview résout le vrai `contractId` **en lecture seule** s'il est déjà
provisionné (sinon `null` = estimation live non persistée) ; elle ne crée jamais de
contrat (le provisioning reste au endpoint `persist`).

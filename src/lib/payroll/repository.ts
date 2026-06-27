/**
 * Persistance Payroll Inputs (Étage 2) — accès DB.
 *
 * Responsabilités :
 *  - provisioning IDEMPOTENT (pas de doublon) : Establishment ⟵ Store,
 *    EmploymentContract ⟵ Employee × Establishment ;
 *  - calcul + upsert d'une ligne PayrollInput par (contrat × période),
 *    garde anti-doublon assurée par `@@unique([contractId, period])` ;
 *  - transitions de statut (draft/validated/locked) sous garde pure.
 *
 * FRONTIÈRE : on persiste des QUANTITÉS qualifiées, jamais une valorisation.
 */
import { prisma } from "@/lib/prisma";
import type { ContractType } from "@/generated/prisma/client";
import { buildPayrollPreview } from "./service";
import type { ClockInRow, AbsenceRow } from "./source";
import {
  canTransitionPayrollInput,
  isPayrollInputWritable,
  type PayrollInputStatus,
} from "./persistence";

const DEFAULT_CONTRACT_TYPE = "CDI" as ContractType;
const DEFAULT_WEEKLY_HOURS = 35;

/** Garantit (idempotent) un Establishment 1-1 rattaché au Store. */
export async function ensureEstablishment(storeId: string) {
  const existing = await prisma.establishment.findUnique({ where: { storeId } });
  if (existing) return existing;

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      unit: { select: { organization: { select: { legalName: true } } } },
    },
  });
  if (!store) throw new Error("store_not_found");

  return prisma.establishment.create({
    data: { storeId, legalName: store.unit?.organization?.legalName ?? store.name },
  });
}

/**
 * Garantit (idempotent) un contrat « courant » (endDate = null) pour un
 * salarié dans un établissement. Réutilise le contrat ouvert existant s'il y en
 * a un (pas de doublon) ; sinon en provisionne un avec les valeurs par défaut
 * dérivées de l'employé (éditables ensuite).
 */
export async function ensureContract(employeeId: string, establishmentId: string) {
  const existing = await prisma.employmentContract.findFirst({
    where: { employeeId, establishmentId, endDate: null },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { contractType: true, weeklyHours: true },
  });
  if (!emp) throw new Error("employee_not_found");

  return prisma.employmentContract.create({
    data: {
      employeeId,
      establishmentId,
      contractType: emp.contractType ?? DEFAULT_CONTRACT_TYPE,
      weeklyHours: emp.weeklyHours ?? DEFAULT_WEEKLY_HOURS,
      startDate: new Date(), // placeholder de provisioning, éditable
    },
  });
}

/** Lit l'établissement d'un magasin (ou null) avec ses contrats + salariés. */
export async function getEstablishmentByStore(storeId: string) {
  return prisma.establishment.findUnique({
    where: { storeId },
    select: {
      id: true,
      storeId: true,
      siret: true,
      legalName: true,
      apeCode: true,
      contracts: {
        select: {
          id: true,
          contractType: true,
          weeklyHours: true,
          startDate: true,
          endDate: true,
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { employee: { lastName: "asc" } },
      },
    },
  });
}

/** Met à jour les métadonnées administratives d'un établissement. */
export async function updateEstablishment(
  id: string,
  data: { siret?: string | null; legalName?: string | null; apeCode?: string | null }
) {
  return prisma.establishment.update({
    where: { id },
    data,
    select: { id: true, storeId: true, siret: true, legalName: true, apeCode: true },
  });
}

export interface PersistResult {
  contractId: string;
  period: string;
  status: PayrollInputStatus;
  written: boolean;
  reason?: string;
}

/**
 * Calcule les variables (quantités) d'un contrat × période et les persiste
 * en draft (upsert sur la clé unique). Une ligne déjà `validated`/`locked`
 * n'est PAS réécrite (garde de cycle de vie) et est renvoyée telle quelle.
 */
export async function persistPayrollInputForContract(params: {
  contractId: string;
  period: string;
  contractWeeklyHours: number;
  clockIns: ClockInRow[];
  absences: AbsenceRow[];
}): Promise<PersistResult> {
  const { contractId, period } = params;

  const existing = await prisma.payrollInput.findUnique({
    where: { contractId_period: { contractId, period } },
    select: { status: true },
  });
  if (existing && !isPayrollInputWritable(existing.status as PayrollInputStatus)) {
    return { contractId, period, status: existing.status as PayrollInputStatus, written: false, reason: "not_writable" };
  }

  const { variables: v } = buildPayrollPreview({
    key: { companySiren: null, establishmentSiret: null, contractId, period },
    contractWeeklyHours: params.contractWeeklyHours,
    clockIns: params.clockIns,
    absences: params.absences,
  });

  const data = {
    totalWorkedHours: v.totalWorkedHours,
    normalHours: v.normalHours,
    overtimeHours: v.overtimeHours,
    complementaryHours: v.complementaryHours,
    sundayHours: v.sundayHours,
    holidayHours: v.holidayHours,
    paidLeaveDays: v.paidLeaveDays,
    sickOrAccidentDays: v.sickOrAccidentDays,
    otherAbsenceDays: v.otherAbsenceDays,
    latenessMinutes: v.latenessMinutes,
  };

  const row = await prisma.payrollInput.upsert({
    where: { contractId_period: { contractId, period } },
    create: { contractId, period, ...data, status: "draft" },
    update: data, // statut inchangé : seul `draft` arrive ici (garde ci-dessus)
    select: { status: true },
  });

  return { contractId, period, status: row.status as PayrollInputStatus, written: true };
}

export interface StatusChangeResult {
  ok: boolean;
  status: PayrollInputStatus;
  reason?: string;
}

/**
 * Change le statut d'une ligne PayrollInput sous garde de transition pure.
 * `locked` est terminal côté application (verrou mensuel non destructif).
 */
export async function changePayrollInputStatus(
  id: string,
  to: PayrollInputStatus
): Promise<StatusChangeResult> {
  const row = await prisma.payrollInput.findUnique({ where: { id }, select: { status: true } });
  if (!row) return { ok: false, status: "draft", reason: "not_found" };

  const from = row.status as PayrollInputStatus;
  if (!canTransitionPayrollInput(from, to)) {
    return { ok: false, status: from, reason: "invalid_transition" };
  }

  const updated = await prisma.payrollInput.update({
    where: { id },
    data: {
      status: to,
      validatedAt: to === "validated" ? new Date() : to === "draft" ? null : undefined,
      lockedAt: to === "locked" ? new Date() : undefined,
    },
    select: { status: true },
  });

  return { ok: true, status: updated.status as PayrollInputStatus };
}

jest.mock("@/lib/prisma", () => ({
  prisma: {
    establishment: { findUnique: jest.fn(), create: jest.fn() },
    store: { findUnique: jest.fn() },
    employmentContract: { findFirst: jest.fn(), create: jest.fn() },
    employee: { findUnique: jest.fn() },
    payrollInput: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  },
}));

import {
  ensureEstablishment,
  ensureContract,
  persistPayrollInputForContract,
  changePayrollInputStatus,
} from "@/lib/payroll/repository";
import { prisma } from "@/lib/prisma";

// Paie / Étage 2 — persistance. On verifie : provisioning IDEMPOTENT (pas de
// doublon), garde anti-reecriture (locked/validated), gardes de transition.
// Aucune valorisation : on persiste des quantites.

const m = {
  estFind: prisma.establishment.findUnique as jest.Mock,
  estCreate: prisma.establishment.create as jest.Mock,
  storeFind: prisma.store.findUnique as jest.Mock,
  contractFind: prisma.employmentContract.findFirst as jest.Mock,
  contractCreate: prisma.employmentContract.create as jest.Mock,
  empFind: prisma.employee.findUnique as jest.Mock,
  inputFind: prisma.payrollInput.findUnique as jest.Mock,
  inputUpsert: prisma.payrollInput.upsert as jest.Mock,
  inputUpdate: prisma.payrollInput.update as jest.Mock,
};

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
});

describe("ensureEstablishment (idempotent)", () => {
  it("renvoie l'etablissement existant sans en creer un nouveau", async () => {
    m.estFind.mockResolvedValue({ id: "est1", storeId: "s1" });
    const r = await ensureEstablishment("s1");
    expect(r).toMatchObject({ id: "est1" });
    expect(m.estCreate).not.toHaveBeenCalled();
  });

  it("provisionne un etablissement absent (legalName herite de l'organisation)", async () => {
    m.estFind.mockResolvedValue(null);
    m.storeFind.mockResolvedValue({ id: "s1", name: "Boutique 1", unit: { organization: { legalName: "ACME SARL" } } });
    m.estCreate.mockResolvedValue({ id: "est-new", storeId: "s1" });
    await ensureEstablishment("s1");
    expect(m.estCreate).toHaveBeenCalledTimes(1);
    expect(m.estCreate.mock.calls[0][0].data).toMatchObject({ storeId: "s1", legalName: "ACME SARL" });
  });
});

describe("ensureContract (idempotent)", () => {
  it("reutilise le contrat ouvert existant (pas de doublon)", async () => {
    m.contractFind.mockResolvedValue({ id: "c1", employeeId: "e1", establishmentId: "est1" });
    const r = await ensureContract("e1", "est1");
    expect(r).toMatchObject({ id: "c1" });
    expect(m.contractCreate).not.toHaveBeenCalled();
  });

  it("provisionne un contrat avec valeurs par defaut (CDI / 35h) si l'employe n'en a pas", async () => {
    m.contractFind.mockResolvedValue(null);
    m.empFind.mockResolvedValue({ contractType: null, weeklyHours: null });
    m.contractCreate.mockResolvedValue({ id: "c-new" });
    await ensureContract("e1", "est1");
    expect(m.contractCreate).toHaveBeenCalledTimes(1);
    expect(m.contractCreate.mock.calls[0][0].data).toMatchObject({
      employeeId: "e1", establishmentId: "est1", contractType: "CDI", weeklyHours: 35,
    });
  });
});

describe("persistPayrollInputForContract", () => {
  const baseArgs = { contractId: "c1", period: "2026-06", contractWeeklyHours: 35, clockIns: [], absences: [] };

  it("ne reecrit PAS une ligne verrouillee (garde de cycle de vie)", async () => {
    m.inputFind.mockResolvedValue({ status: "locked" });
    const r = await persistPayrollInputForContract(baseArgs);
    expect(r).toMatchObject({ written: false, reason: "not_writable", status: "locked" });
    expect(m.inputUpsert).not.toHaveBeenCalled();
  });

  it("ne reecrit PAS une ligne validee", async () => {
    m.inputFind.mockResolvedValue({ status: "validated" });
    const r = await persistPayrollInputForContract(baseArgs);
    expect(r.written).toBe(false);
    expect(m.inputUpsert).not.toHaveBeenCalled();
  });

  it("upsert une nouvelle ligne en draft (anti-doublon par cle contractId+period)", async () => {
    m.inputFind.mockResolvedValue(null);
    m.inputUpsert.mockResolvedValue({ status: "draft" });
    const clockIns = [
      { clockInAt: new Date("2026-06-22T09:00:00Z"), clockOutAt: new Date("2026-06-22T17:00:00Z"), status: "ON_TIME", lateMinutes: 0 },
    ];
    const r = await persistPayrollInputForContract({ ...baseArgs, clockIns });
    expect(r.written).toBe(true);
    expect(m.inputUpsert).toHaveBeenCalledTimes(1);
    const arg = m.inputUpsert.mock.calls[0][0];
    expect(arg.where.contractId_period).toEqual({ contractId: "c1", period: "2026-06" });
    expect(arg.create).toMatchObject({ contractId: "c1", period: "2026-06", status: "draft", totalWorkedHours: 8 });
  });
});

describe("changePayrollInputStatus (gardes de transition)", () => {
  it("refuse une transition illegale (locked -> draft)", async () => {
    m.inputFind.mockResolvedValue({ status: "locked" });
    const r = await changePayrollInputStatus("id1", "draft");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_transition");
    expect(m.inputUpdate).not.toHaveBeenCalled();
  });

  it("404 si la ligne n'existe pas", async () => {
    m.inputFind.mockResolvedValue(null);
    const r = await changePayrollInputStatus("id-x", "validated");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_found");
  });

  it("applique draft -> validated et horodate validatedAt", async () => {
    m.inputFind.mockResolvedValue({ status: "draft" });
    m.inputUpdate.mockResolvedValue({ status: "validated" });
    const r = await changePayrollInputStatus("id1", "validated");
    expect(r).toEqual({ ok: true, status: "validated" });
    expect(m.inputUpdate.mock.calls[0][0].data.validatedAt).toBeInstanceOf(Date);
  });

  it("applique validated -> locked et horodate lockedAt", async () => {
    m.inputFind.mockResolvedValue({ status: "validated" });
    m.inputUpdate.mockResolvedValue({ status: "locked" });
    const r = await changePayrollInputStatus("id1", "locked");
    expect(r.ok).toBe(true);
    expect(m.inputUpdate.mock.calls[0][0].data.lockedAt).toBeInstanceOf(Date);
  });
});

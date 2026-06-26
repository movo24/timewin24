import { canAccessPayslip } from "@/lib/payroll/payslip-acl";
import type { PayslipRef } from "@/lib/payroll/payslip-acl";

// Paie / Étage 4 — controle d'acces aux bulletins (donnee sensible).
// Moindre privilege : refus par defaut sauf regle explicite.

const slip = (o: Partial<PayslipRef> = {}): PayslipRef => ({
  employeeId: "e1", establishmentId: "est1", deliveryMode: "digital", employeeActive: true, ...o,
});

describe("canAccessPayslip", () => {
  it("GROUP_ADMIN : acces complet", () => {
    expect(canAccessPayslip({ role: "GROUP_ADMIN" }, slip()).allowed).toBe(true);
  });

  it("HR_MANAGER : acces RH complet", () => {
    expect(canAccessPayslip({ role: "HR_MANAGER" }, slip()).allowed).toBe(true);
  });

  it("STORE_MANAGER : pas d'acces au contenu (confidentialite salariale)", () => {
    const d = canAccessPayslip({ role: "STORE_MANAGER" }, slip());
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("store_manager_no_payslip_content");
  });

  it("EMPLOYEE : acces a SON bulletin", () => {
    expect(canAccessPayslip({ role: "EMPLOYEE", employeeId: "e1" }, slip()).allowed).toBe(true);
  });

  it("EMPLOYEE : refus sur le bulletin d'un autre", () => {
    const d = canAccessPayslip({ role: "EMPLOYEE", employeeId: "e2" }, slip());
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("not_owner");
  });

  it("EMPLOYEE : opposition dematerialisation -> pas de telechargement numerique", () => {
    const d = canAccessPayslip({ role: "EMPLOYEE", employeeId: "e1" }, slip({ deliveryMode: "paper_required" }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("paper_required");
  });

  it("EMPLOYEE : conserve l'acces a ses bulletins apres son depart", () => {
    expect(canAccessPayslip({ role: "EMPLOYEE", employeeId: "e1" }, slip({ employeeActive: false })).allowed).toBe(true);
  });
});

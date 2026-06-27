import {
  canTransitionPayrollInput,
  isPayrollInputWritable,
  INITIAL_PAYROLL_STATUS,
} from "@/lib/payroll/persistence";

// Paie / Étage 2 — cycle de vie PUR des variables persistées.
// draft -> validated -> locked (verrou mensuel non destructif).

describe("canTransitionPayrollInput", () => {
  it("autorise le flux nominal draft -> validated -> locked", () => {
    expect(canTransitionPayrollInput("draft", "validated")).toBe(true);
    expect(canTransitionPayrollInput("validated", "locked")).toBe(true);
  });
  it("autorise la reouverture validated -> draft", () => {
    expect(canTransitionPayrollInput("validated", "draft")).toBe(true);
  });
  it("refuse les sauts illegaux", () => {
    expect(canTransitionPayrollInput("draft", "locked")).toBe(false); // doit valider d'abord
    expect(canTransitionPayrollInput("draft", "draft")).toBe(false);
    expect(canTransitionPayrollInput("locked", "draft")).toBe(false); // terminal cote appli
    expect(canTransitionPayrollInput("locked", "validated")).toBe(false);
  });
});

describe("isPayrollInputWritable", () => {
  it("seul draft est reecrasable", () => {
    expect(isPayrollInputWritable("draft")).toBe(true);
    expect(isPayrollInputWritable("validated")).toBe(false);
    expect(isPayrollInputWritable("locked")).toBe(false);
  });
});

describe("INITIAL_PAYROLL_STATUS", () => {
  it("une ligne fraiche est en draft", () => {
    expect(INITIAL_PAYROLL_STATUS).toBe("draft");
  });
});

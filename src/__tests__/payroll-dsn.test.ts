import {
  canTransitionDsn,
  isDsnSubmissionEnabled,
  assertDsnSubmissionAllowed,
} from "@/lib/payroll/dsn";

// Paie / Étage 5 (socle) — machine a etats DSN + feature flag obligatoire.
// AUCUN depot reel : le flag est desactive par defaut et garde-fou.

describe("canTransitionDsn", () => {
  it("autorise le flux nominal draft->validated->exported->submitted->accepted", () => {
    expect(canTransitionDsn("draft", "validated")).toBe(true);
    expect(canTransitionDsn("validated", "exported")).toBe(true);
    expect(canTransitionDsn("exported", "submitted")).toBe(true);
    expect(canTransitionDsn("submitted", "accepted")).toBe(true);
  });
  it("autorise rejected->draft (reprise) et submitted->rejected", () => {
    expect(canTransitionDsn("submitted", "rejected")).toBe(true);
    expect(canTransitionDsn("rejected", "draft")).toBe(true);
  });
  it("refuse les sauts illegaux", () => {
    expect(canTransitionDsn("draft", "submitted")).toBe(false);
    expect(canTransitionDsn("accepted", "draft")).toBe(false); // terminal
    expect(canTransitionDsn("draft", "accepted")).toBe(false);
  });
});

describe("feature flag DSN (desactive par defaut)", () => {
  const original = process.env.DSN_SUBMISSION_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.DSN_SUBMISSION_ENABLED;
    else process.env.DSN_SUBMISSION_ENABLED = original;
  });

  it("est desactive par defaut", () => {
    delete process.env.DSN_SUBMISSION_ENABLED;
    expect(isDsnSubmissionEnabled()).toBe(false);
    expect(() => assertDsnSubmissionAllowed()).toThrow(/desactiv|Tier-3/i);
  });

  it("ne s'active que sur la valeur exacte 'true'", () => {
    process.env.DSN_SUBMISSION_ENABLED = "1";
    expect(isDsnSubmissionEnabled()).toBe(false);
    process.env.DSN_SUBMISSION_ENABLED = "true";
    expect(isDsnSubmissionEnabled()).toBe(true);
    expect(() => assertDsnSubmissionAllowed()).not.toThrow();
  });
});

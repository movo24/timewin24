import { sanitizeSmtpError } from "@/lib/notifications/email";

// ─── Test 6 : Erreur SMTP simulée — vérifier qu'aucune fuite ne sort ────
describe("sanitizeSmtpError", () => {
  it("masque les credentials SMTP (auth failed)", () => {
    const raw =
      "535 5.7.8 Error: authentication failed: Invalid login: 535-5.7.8 Username and Password not accepted. Learn more at https://...";
    const out = sanitizeSmtpError(raw);
    expect(out).toBe("Erreur d'authentification SMTP");
    expect(out).not.toContain("Username");
    expect(out).not.toContain("Password");
    expect(out).not.toContain("535");
  });

  it("masque les chemins serveur (timeout)", () => {
    const raw =
      "Error: connect ETIMEDOUT 192.168.1.42:587 at TCPConnectWrap.afterConnect [as oncomplete]";
    const out = sanitizeSmtpError(raw);
    expect(out).toBe("Serveur SMTP injoignable");
    expect(out).not.toContain("192.168");
    expect(out).not.toContain("ETIMEDOUT");
  });

  it("détecte rate limit", () => {
    expect(sanitizeSmtpError("429 Too Many Requests: rate limit exceeded")).toBe(
      "Limite d'envoi atteinte"
    );
    expect(sanitizeSmtpError("Resend rate limit hit")).toBe(
      "Limite d'envoi atteinte"
    );
  });

  it("détecte adresse invalide", () => {
    expect(
      sanitizeSmtpError("550 5.1.1 user@unknown.com: Recipient does not exist")
    ).toBe("Adresse destinataire inexistante");
    expect(
      sanitizeSmtpError("Invalid recipient: malformed email")
    ).toBe("Adresse destinataire invalide");
  });

  it("retourne un message générique pour des erreurs inconnues", () => {
    expect(sanitizeSmtpError("Some weird unknown error")).toBe("Erreur d'envoi");
    expect(sanitizeSmtpError("")).toBe("Erreur d'envoi");
  });

  it("ne renvoie JAMAIS le message brut au client (anti-fuite)", () => {
    const sensitive = [
      "auth failed: smtp_user=admin@internal.timewin secret=hunter2",
      "535 invalid creds for noreply@movo24.com on smtp.resend.com:465",
      "ECONNREFUSED 10.0.0.5:25",
    ];
    for (const raw of sensitive) {
      const out = sanitizeSmtpError(raw);
      expect(out).not.toContain("hunter2");
      expect(out).not.toContain("@internal");
      expect(out).not.toContain("10.0.0");
      expect(out).not.toContain("smtp.resend.com");
      // Le message retourné doit être court (< 50 chars) pour éviter les fuites
      expect(out.length).toBeLessThan(50);
    }
  });
});

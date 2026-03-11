import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "noreply@timewin.fr";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

interface EmailParams {
  to: string;
  subject: string;
  title: string;
  body: string;
  url?: string;
}

/**
 * Send email notification.
 * Returns { success, error? }. Silently no-ops if SMTP not configured.
 */
export async function sendEmail(
  params: EmailParams
): Promise<{ success: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) {
    return { success: false, error: "SMTP non configuré" };
  }

  const html = buildEmailHtml(params.title, params.body, params.url);

  try {
    await t.sendMail({
      from: `"TimeWin" <${SMTP_FROM}>`,
      to: params.to,
      subject: params.subject,
      html,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("Email send error:", message);
    return { success: false, error: message };
  }
}

/**
 * Check if SMTP is configured.
 */
export function isEmailConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function buildEmailHtml(title: string, body: string, url?: string): string {
  const buttonHtml = url
    ? `<a href="${url}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Voir dans TimeWin</a>`
    : "";

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;">
  <div style="max-width:480px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#111827;padding:16px 24px;">
      <span style="color:#fff;font-size:18px;font-weight:700;">TimeWin</span>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 8px;font-size:16px;color:#111827;">${title}</h2>
      <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.5;">${body}</p>
      ${buttonHtml}
    </div>
    <div style="padding:12px 24px;background:#f9fafb;font-size:12px;color:#9ca3af;text-align:center;">
      TimeWin — Gestion de Planning
    </div>
  </div>
</body>
</html>`.trim();
}

const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;

/**
 * Send SMS via Twilio REST API.
 * Returns { success, error? }. Silently no-ops if Twilio not configured.
 */
export async function sendSMS(
  to: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSmsConfigured()) {
    return { success: false, error: "Twilio non configuré" };
  }

  if (!to || !message) {
    return { success: false, error: "Numéro ou message manquant" };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH_TOKEN}`).toString(
      "base64"
    );

    const body = new URLSearchParams({
      To: to,
      From: TWILIO_FROM!,
      Body: message,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg =
        (data as { message?: string }).message || `HTTP ${res.status}`;
      return { success: false, error: errMsg };
    }

    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erreur SMS inconnue";
    console.error("SMS send error:", message);
    return { success: false, error: message };
  }
}

/**
 * Check if Twilio is configured.
 */
export function isSmsConfigured(): boolean {
  return Boolean(TWILIO_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM);
}

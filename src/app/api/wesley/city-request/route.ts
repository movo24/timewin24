import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";

// POST /api/wesley/city-request
// Capture "je veux The Wesley dans ma ville" (signal d'expansion).
// V1 : validation + log structuré (alimentera le dashboard géographique en V2 via une table dédiée).
// Public, donc rate-limité par IP pour limiter le spam.

const schema = z.object({
  city: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`wesley-city:${ip}`, RATE_LIMITS.login);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de demandes. Réessaie plus tard." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ville requise" }, { status: 400 });
  }

  const { city, email } = parsed.data;
  // V2 : persister dans une table WesleyCityRequest (ville, email, ip hashée, ts) pour le scoring.
  console.info("[wesley:city_request]", JSON.stringify({ city, hasEmail: Boolean(email), ts: Date.now() }));

  return NextResponse.json({ ok: true });
}

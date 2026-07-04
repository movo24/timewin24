/**
 * In-memory rate limiter for Next.js API routes.
 * Production: replace with Redis-backed limiter for multi-instance.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);
// Ne pas empecher le process (CLI/tests) de se terminer.
cleanupTimer.unref?.();

export interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/**
 * Check rate limit for a given key (typically IP or IP+route).
 * Returns { allowed, remaining, resetAt } or throws nothing.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.limit - 1, retryAfterMs: 0 };
  }

  entry.count++;
  if (entry.count > config.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  return {
    allowed: true,
    remaining: config.limit - entry.count,
    retryAfterMs: 0,
  };
}

/** Pre-configured rate limiters — overridable via env */
function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

export const RATE_LIMITS = {
  login: {
    limit: envInt('LOGIN_RATE_LIMIT_MAX', 5),
    windowMs: envInt('LOGIN_RATE_LIMIT_WINDOW_MS', 60_000),
  },
  api: {
    limit: envInt('RATE_LIMIT_MAX', 100),
    windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60_000),
  },
  webhook: {
    limit: envInt('WEBHOOK_RATE_LIMIT_MAX', 200),
    windowMs: envInt('WEBHOOK_RATE_LIMIT_WINDOW_MS', 60_000),
  },
  heavy: {
    limit: envInt('HEAVY_RATE_LIMIT_MAX', 20),
    windowMs: envInt('HEAVY_RATE_LIMIT_WINDOW_MS', 60_000),
  },
};

/**
 * Helper: extract client IP from NextRequest
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

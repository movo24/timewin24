/**
 * Next.js Instrumentation — runs once at startup.
 * Validates required environment variables before serving requests.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const isProd = process.env.NODE_ENV === 'production';

    // Always required
    const required = ['DATABASE_URL', 'NEXTAUTH_SECRET'];
    const missing = required.filter((k) => !process.env[k]);

    if (isProd) {
      // Additional production requirements
      const prodRequired = ['NEXTAUTH_URL'];
      missing.push(...prodRequired.filter((k) => !process.env[k]));
    }

    if (missing.length > 0) {
      console.error(
        `[FATAL] Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy .env.production.example to .env and fill in all values.',
      );
      if (isProd) {
        process.exit(1);
      }
    }

    // Reject insecure NEXTAUTH_SECRET
    if (process.env.NEXTAUTH_SECRET) {
      if (process.env.NEXTAUTH_SECRET.length < 32) {
        console.error('[FATAL] NEXTAUTH_SECRET must be at least 32 characters. Generate with: openssl rand -hex 32');
        if (isProd) process.exit(1);
      }
    }

    // Log startup config (safe values only)
    console.log(`[TimeWin24] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[TimeWin24] Database: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, '//***@') || 'NOT SET'}`);
    console.log(`[TimeWin24] AI Engine: ${process.env.AI_ENGINE_ENABLED === 'true' ? 'enabled' : 'disabled'}`);
  }
}

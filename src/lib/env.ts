import 'server-only';

/**
 * Centralised, validated environment access.
 *
 * Rules:
 *  - Nothing here is read on the client. Importing this file from a client
 *    component is a build error (`server-only`).
 *  - Missing optional integrations degrade to a clearly-labelled disabled state
 *    rather than crashing. The app must be fully runnable and testable with an
 *    empty .env.
 *  - Anything genuinely unsafe to default is required in production only.
 */

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITEST;

function required(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (isProd) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return devFallback;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const stripeSecretKey = optional('STRIPE_SECRET_KEY');
const stripeWebhookSecret = optional('STRIPE_WEBHOOK_SECRET');

export const env = {
  isProd,
  isTest,
  isDev: !isProd && !isTest,

  /**
   * Secret used to derive session-token lookup hashes and to sign DNS
   * verification tokens. Rotating it invalidates every session, by design.
   *
   * A getter, not a constant: `next build` runs with NODE_ENV=production but
   * without the runtime secrets, so validating at module load would make the
   * build itself demand production credentials. Required values are therefore
   * checked when they are first used, and checkRequiredEnv() below is called
   * from instrumentation.ts so a misconfigured deployment still fails
   * immediately at server start rather than on a customer's first request.
   */
  get APP_SECRET(): string {
    return required(
      'APP_SECRET',
      // Deterministic, obviously-not-secret dev value.
      'dev-only-insecure-secret-do-not-use-in-production',
    );
  },

  /** Absolute origin, used in emails, Stripe redirects and canonical URLs. */
  APP_URL: (optional('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, ''),

  /**
   * Postgres connection string. When unset the app uses PGlite (Postgres
   * compiled to WASM) against a local directory, so `npm run dev` works with
   * zero database setup. Same SQL, same migrations.
   */
  DATABASE_URL: optional('DATABASE_URL'),
  PGLITE_DATA_DIR: optional('PGLITE_DATA_DIR') ?? '.data/pg',

  /** Protects the scheduled-scan endpoint from public invocation. */
  get CRON_SECRET(): string {
    return required('CRON_SECRET', 'dev-cron-secret');
  },

  anthropic: {
    apiKey: optional('ANTHROPIC_API_KEY'),
    get enabled() {
      return !!this.apiKey;
    },
    model: optional('ANTHROPIC_MODEL') ?? 'claude-opus-5',
    /** Hard ceiling on spend per remediation write-up. */
    maxTokens: int('ANTHROPIC_MAX_TOKENS', 1400),
  },

  stripe: {
    secretKey: stripeSecretKey,
    webhookSecret: stripeWebhookSecret,
    publishableKey: optional('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
    priceIdPro: optional('STRIPE_PRICE_ID_PRO'),
    priceIdAgency: optional('STRIPE_PRICE_ID_AGENCY'),
    /** Billing is only wired up when we have both a key and a webhook secret. */
    enabled: !!stripeSecretKey && !!stripeWebhookSecret,
    /** True only for a live (non-test) key. Used to label the UI honestly. */
    isLiveMode: !!stripeSecretKey?.startsWith('sk_live_'),
  },

  email: {
    resendApiKey: optional('RESEND_API_KEY'),
    from: optional('EMAIL_FROM') ?? 'SecurePulse <alerts@localhost>',
    get enabled() {
      return !!this.resendApiKey;
    },
  },

  scanner: {
    /** Per-request network timeout, milliseconds. */
    timeoutMs: int('SCAN_TIMEOUT_MS', 10_000),
    /** Hard cap on HTTP requests issued by a single scan. Abuse guardrail. */
    maxRequestsPerScan: int('SCAN_MAX_REQUESTS', 24),
    userAgent:
      optional('SCAN_USER_AGENT') ??
      'SecurePulseBot/1.0 (+https://securepulse.app/bot; passive security posture check)',
  },
} as const;

export type Env = typeof env;

/**
 * Fails fast on a misconfigured production deployment.
 *
 * Called from instrumentation.ts, which Next.js runs when the server starts
 * and not during the build, so this is the earliest honest point to demand
 * runtime secrets.
 */
export function checkRequiredEnv(): void {
  if (!isProd) return;
  // Touching each getter runs its validation.
  void env.APP_SECRET;
  void env.CRON_SECRET;
}

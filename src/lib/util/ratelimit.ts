import 'server-only';

import { sql } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { rateLimits } from '@/lib/db/schema';

/**
 * Fixed-window rate limiting, stored in Postgres.
 *
 * Deliberately not an in-memory map. The app runs as serverless functions, so
 * a per-process counter is per-instance, and an attacker gets the full limit
 * again on every cold start or every new instance. That is not a limit.
 *
 * The increment is a single atomic upsert, so two concurrent requests cannot
 * both read the old count and both be allowed through.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const db = await getDb();
  const now = new Date();
  const nextReset = new Date(now.getTime() + windowMs);

  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: nextReset })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // Expired window: start a fresh one. Otherwise increment in place.
        count: sql`case when ${rateLimits.resetAt} <= ${now} then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} <= ${now} then ${nextReset} else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

  const used = row?.count ?? 1;
  const resetAt = row?.resetAt ?? nextReset;

  return {
    allowed: used <= limit,
    remaining: Math.max(0, limit - used),
    limit,
    resetAt,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
    ),
  };
}

/** Removes expired windows. Called by the scheduled maintenance job. */
export async function purgeExpiredRateLimits(): Promise<number> {
  const db = await getDb();
  const removed = await db
    .delete(rateLimits)
    .where(sql`${rateLimits.resetAt} < now()`)
    .returning({ key: rateLimits.key });
  return removed.length;
}

/** Named limits, kept together so the policy is reviewable in one place. */
export const LIMITS = {
  /** Anonymous scans from the marketing site, per IP. */
  publicScan: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Failed logins per email, to slow credential stuffing. */
  loginAttempt: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** Signups per IP, to slow automated account creation. */
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Authenticated scans, on top of the plan quota, to stop hammering. */
  authenticatedScan: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** Reset requests per email, and separately per IP. */
  passwordReset: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Verification attempts per domain. */
  domainVerify: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const;

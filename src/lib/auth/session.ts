import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

import { and, eq, gt, lt } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { getDb } from '@/lib/db';
import { sessions, subscriptions, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import type { Plan, Subscription, User } from '@/lib/db/schema';

/**
 * Server-side sessions backed by an opaque random token.
 *
 * Why not a JWT: a signed token cannot be revoked. Logging out, a password
 * change, or an account takeover response all need the old credential to stop
 * working immediately, and with a stateless token it keeps working until it
 * expires. A database row can simply be deleted.
 *
 * The raw token is never stored. The database holds an HMAC of it keyed on
 * APP_SECRET, so a dump of the sessions table hands an attacker no usable
 * credential. Lookup is still a single indexed read because the HMAC is
 * deterministic.
 */

const COOKIE_NAME = 'sp_session';
const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Refresh lastUsedAt at most this often, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHmac('sha256', env.APP_SECRET).update(token).digest('hex');
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

export interface AuthContext {
  user: SessionUser;
  sessionId: string;
  plan: Plan;
  subscription: Subscription | null;
}

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 500) ?? null,
  });

  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    // Lax still sends the cookie on top-level navigation, which is what makes
    // returning from Stripe Checkout work, while blocking cross-site POSTs.
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
    maxAge: 0,
  });
}

/**
 * Resolves the caller from their session cookie.
 *
 * Returns null for every failure mode (no cookie, unknown token, expired
 * session, deleted user) so callers cannot accidentally leak which one it was.
 */
export async function getAuth(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const db = await getDb();
  const now = new Date();

  const rows = await db
    .select({
      sessionId: sessions.id,
      lastUsedAt: sessions.lastUsedAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Keep the write off the hot path: a session used on every page load would
  // otherwise produce an UPDATE per request.
  if (now.getTime() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ lastUsedAt: now })
      .where(eq(sessions.id, row.sessionId));
  }

  const subscriptionRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, row.userId))
    .limit(1);

  const subscription = subscriptionRows[0] ?? null;

  return {
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      createdAt: row.createdAt,
    },
    sessionId: row.sessionId,
    plan: resolveActivePlan(subscription),
    subscription,
  };
}

/**
 * The plan a subscription actually entitles the user to right now.
 *
 * A paid plan whose payment has failed, or whose period has lapsed, falls back
 * to free. This is deliberately evaluated on read rather than trusted from a
 * stored field, so a missed webhook cannot leave someone on a paid plan
 * indefinitely.
 */
export function resolveActivePlan(subscription: Subscription | null): Plan {
  if (!subscription) return 'free';
  if (subscription.plan === 'free') return 'free';

  const entitled =
    subscription.status === 'active' || subscription.status === 'trialing';
  if (!entitled) return 'free';

  if (
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd.getTime() < Date.now()
  ) {
    return 'free';
  }

  return subscription.plan;
}

export async function destroySession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  await clearSessionCookie();
}

/** Invalidates every session for a user. Used after a password change. */
export async function destroyAllSessions(userId: string): Promise<void> {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Housekeeping for the scheduled job. */
export async function purgeExpiredSessions(): Promise<number> {
  const db = await getDb();
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return deleted.length;
}

export type { User };

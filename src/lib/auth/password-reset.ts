import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull, lt } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { passwordResets, users } from '@/lib/db/schema';
import { env } from '@/lib/env';

/**
 * Password reset tokens.
 *
 * Same discipline as sessions: the raw token goes in the email and only an
 * HMAC of it is stored, so a database leak cannot be turned into account
 * takeover. Tokens are single-use and short-lived, because a reset link that
 * still works a week later is a standing key to the account sitting in an
 * inbox that may itself be compromised.
 */

const TOKEN_BYTES = 32;
const TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHmac('sha256', env.APP_SECRET).update(token).digest('hex');
}

/**
 * Issues a token for an email address.
 *
 * Returns null when no account exists. The caller must respond identically
 * either way: an endpoint that answers differently for a registered address
 * is an account enumeration oracle.
 */
export async function createPasswordReset(
  email: string,
  ip: string | null,
): Promise<{ token: string; userId: string; name: string | null } | null> {
  const db = await getDb();

  const [user] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) return null;

  // Invalidate any outstanding tokens. Requesting a new link should make the
  // previous one stop working, which is what people assume it does.
  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(
      and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)),
    );

  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TTL_MS),
    requestedIp: ip,
  });

  return { token, userId: user.id, name: user.name };
}

/** Resolves a raw token to the account it belongs to, or null. */
export async function findValidReset(
  token: string,
): Promise<{ id: string; userId: string } | null> {
  if (!token) return null;
  const db = await getDb();

  const [row] = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId })
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, hashToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Marks a token used.
 *
 * Conditional on it still being unused, so two requests racing the same link
 * cannot both succeed. The caller treats a zero-row result as "already used".
 */
export async function consumeReset(id: string): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.id, id), isNull(passwordResets.usedAt)))
    .returning({ id: passwordResets.id });
  return updated.length > 0;
}

/** Housekeeping for the scheduled maintenance job. */
export async function purgeExpiredResets(): Promise<number> {
  const db = await getDb();
  const removed = await db
    .delete(passwordResets)
    .where(lt(passwordResets.expiresAt, new Date()))
    .returning({ id: passwordResets.id });
  return removed.length;
}

export function resetUrl(token: string): string {
  return `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
}

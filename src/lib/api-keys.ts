import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { resolveActivePlan } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import { getDb } from '@/lib/db';
import { apiKeys, subscriptions, users } from '@/lib/db/schema';
import type { Plan } from '@/lib/db/schema';
import { env } from '@/lib/env';

/**
 * Read-only API keys.
 *
 * The full key is shown exactly once, at creation, and only an HMAC is stored.
 * That is the difference between a leaked database being an embarrassment and
 * it being a breach of every customer's portfolio.
 */

const KEY_BYTES = 24;
const PREFIX = 'sp_';

function hashKey(key: string): string {
  return createHmac('sha256', env.APP_SECRET).update(key).digest('hex');
}

export async function createApiKey(
  userId: string,
  name: string,
): Promise<{ key: string; id: string; prefix: string }> {
  const db = await getDb();
  const secret = randomBytes(KEY_BYTES).toString('base64url');
  const key = `${PREFIX}${secret}`;
  // Enough to distinguish keys in a list, far too little to guess one from.
  const prefix = key.slice(0, 11);

  const [row] = await db
    .insert(apiKeys)
    .values({ userId, name, keyHash: hashKey(key), prefix })
    .returning({ id: apiKeys.id });

  return { key, id: row.id, prefix };
}

export async function listApiKeys(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)),
    )
    .returning({ id: apiKeys.id });
  return updated.length > 0;
}

export interface ApiCaller {
  userId: string;
  keyId: string;
  plan: Plan;
}

/**
 * Authenticates a bearer token.
 *
 * Entitlement is re-checked on every call rather than trusted from the key's
 * existence: a customer who downgrades keeps their key, and it has to stop
 * working the moment the plan no longer includes API access.
 */
export async function authenticateApiKey(
  authorization: string | null,
): Promise<{ caller: ApiCaller | null; reason?: string }> {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token || !token.startsWith(PREFIX)) {
    return { caller: null, reason: 'Provide a key as: Authorization: Bearer sp_...' };
  }

  const db = await getDb();
  const [row] = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashKey(token)))
    .limit(1);

  if (!row || row.revokedAt) {
    return { caller: null, reason: 'That API key is not valid.' };
  }

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, row.userId))
    .limit(1);

  const plan = resolveActivePlan(subscription ?? null);
  if (!planFor(plan).apiAccess) {
    return {
      caller: null,
      reason: 'API access is part of the Agency plan. This key is inactive.',
    };
  }

  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  if (!account) return { caller: null, reason: 'That API key is not valid.' };

  // Fire-and-forget: a failed bookkeeping write must not fail the request.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => undefined);

  return { caller: { userId: row.userId, keyId: row.id, plan } };
}

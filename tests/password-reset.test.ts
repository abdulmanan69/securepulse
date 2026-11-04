import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  consumeReset,
  createPasswordReset,
  findValidReset,
  purgeExpiredResets,
} from '@/lib/auth/password-reset';
import { getDb } from '@/lib/db';
import { passwordResets } from '@/lib/db/schema';
import { clearAllTables } from './helpers/db';
import { createUser } from './helpers/factories';

beforeEach(async () => {
  await clearAllTables();
});

describe('password reset tokens', () => {
  it('issues a token for a real account', async () => {
    const { user } = await createUser({ email: 'reset@example-test.com' });
    const reset = await createPasswordReset('reset@example-test.com', '203.0.113.5');

    expect(reset).not.toBeNull();
    expect(reset?.userId).toBe(user.id);
    expect(reset?.token.length).toBeGreaterThan(30);
  });

  it('returns null for an unknown address, so the caller can answer identically', async () => {
    expect(await createPasswordReset('nobody@example-test.com', null)).toBeNull();
  });

  it('never stores the raw token', async () => {
    const { user } = await createUser({ email: 'hash@example-test.com' });
    const reset = await createPasswordReset('hash@example-test.com', null);

    const db = await getDb();
    const [row] = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.userId, user.id));

    // A database dump must not yield a usable reset link.
    expect(row.tokenHash).not.toBe(reset?.token);
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves a valid token and rejects a wrong one', async () => {
    await createUser({ email: 'lookup@example-test.com' });
    const reset = await createPasswordReset('lookup@example-test.com', null);

    expect(await findValidReset(reset!.token)).not.toBeNull();
    expect(await findValidReset('not-a-real-token')).toBeNull();
    expect(await findValidReset('')).toBeNull();
  });

  it('is single use', async () => {
    await createUser({ email: 'once@example-test.com' });
    const reset = await createPasswordReset('once@example-test.com', null);
    const found = await findValidReset(reset!.token);

    expect(await consumeReset(found!.id)).toBe(true);
    // The second attempt loses the race and must not be allowed to proceed.
    expect(await consumeReset(found!.id)).toBe(false);
    expect(await findValidReset(reset!.token)).toBeNull();
  });

  it('invalidates an earlier token when a new one is requested', async () => {
    await createUser({ email: 'reissue@example-test.com' });
    const first = await createPasswordReset('reissue@example-test.com', null);
    const second = await createPasswordReset('reissue@example-test.com', null);

    expect(await findValidReset(first!.token)).toBeNull();
    expect(await findValidReset(second!.token)).not.toBeNull();
  });

  it('rejects an expired token and purges it', async () => {
    const { user } = await createUser({ email: 'expired@example-test.com' });
    const reset = await createPasswordReset('expired@example-test.com', null);

    const db = await getDb();
    await db
      .update(passwordResets)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResets.userId, user.id));

    expect(await findValidReset(reset!.token)).toBeNull();
    expect(await purgeExpiredResets()).toBeGreaterThanOrEqual(1);
  });
});

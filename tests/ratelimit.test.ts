import { beforeEach, describe, expect, it } from 'vitest';

import { purgeExpiredRateLimits, rateLimit } from '@/lib/util/ratelimit';
import { clearAllTables } from './helpers/db';

beforeEach(async () => {
  await clearAllTables();
});

describe('rateLimit', () => {
  it('allows up to the limit and refuses beyond it', async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await rateLimit('test:allow', 3, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3 - attempt);
    }

    const blocked = await rateLimit('test:allow', 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys are independent', async () => {
    await rateLimit('test:a', 1, 60_000);
    const other = await rateLimit('test:b', 1, 60_000);
    expect(other.allowed).toBe(true);
  });

  it('starts a fresh window once the old one expires', async () => {
    // A window of zero is already expired by the time the next call lands.
    const first = await rateLimit('test:expiry', 1, 0);
    expect(first.allowed).toBe(true);

    const second = await rateLimit('test:expiry', 1, 0);
    expect(second.allowed).toBe(true);
  });

  it('counts concurrent requests atomically', async () => {
    // The check must not be read-then-write: ten simultaneous requests against
    // a limit of five must produce exactly five allowed, not ten.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rateLimit('test:race', 5, 60_000)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });

  it('purges only expired windows', async () => {
    await rateLimit('test:live', 5, 60_000);
    await rateLimit('test:dead', 5, 0);

    const removed = await purgeExpiredRateLimits();
    expect(removed).toBeGreaterThanOrEqual(1);

    // The live window kept its count, so the next call is the second of five.
    const stillCounted = await rateLimit('test:live', 5, 60_000);
    expect(stillCounted.remaining).toBe(3);
  });
});

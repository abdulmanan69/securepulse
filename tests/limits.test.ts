import { beforeEach, describe, expect, it } from 'vitest';

import { resolveActivePlan } from '@/lib/auth/session';
import { PLANS } from '@/lib/billing/plans';
import {
  LimitExceededError,
  assertCanAddDomain,
  assertCanScan,
  assertFrequencyAllowed,
  getUsage,
} from '@/lib/billing/usage';
import { clearAllTables } from './helpers/db';
import { createDomain, createUser, recordScan, setPlan } from './helpers/factories';

beforeEach(async () => {
  await clearAllTables();
});

describe('plan entitlement', () => {
  it('treats a missing subscription as free', () => {
    expect(resolveActivePlan(null)).toBe('free');
  });

  it('honours an active paid subscription', async () => {
    const { user } = await createUser();
    const subscription = await setPlan(user.id, 'pro');
    expect(resolveActivePlan(subscription)).toBe('pro');
  });

  it('drops a past_due subscription back to free', async () => {
    const { user } = await createUser();
    const subscription = await setPlan(user.id, 'pro', { status: 'past_due' });
    // The whole point: a failed payment must not keep granting paid features
    // just because the plan column still says "pro".
    expect(resolveActivePlan(subscription)).toBe('free');
  });

  it('drops a canceled subscription back to free', async () => {
    const { user } = await createUser();
    const subscription = await setPlan(user.id, 'agency', { status: 'canceled' });
    expect(resolveActivePlan(subscription)).toBe('free');
  });

  it('drops a lapsed period back to free even while marked active', async () => {
    const { user } = await createUser();
    // Models a webhook we never received: Stripe stopped billing but our row
    // was never updated. Evaluating on read closes that hole.
    const subscription = await setPlan(user.id, 'pro', {
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
    });
    expect(resolveActivePlan(subscription)).toBe('free');
  });

  it('keeps a trialing subscription entitled', async () => {
    const { user } = await createUser();
    const subscription = await setPlan(user.id, 'pro', { status: 'trialing' });
    expect(resolveActivePlan(subscription)).toBe('pro');
  });
});

describe('domain limits', () => {
  it('allows up to the plan limit and refuses the next one', async () => {
    const { user, subscription } = await createUser();

    await assertCanAddDomain(user.id, 'free', subscription);
    await createDomain(user.id, 'one.example-test.com');

    await expect(
      assertCanAddDomain(user.id, 'free', subscription),
    ).rejects.toBeInstanceOf(LimitExceededError);
  });

  it('gives a paid plan its larger allowance', async () => {
    const { user } = await createUser();
    const subscription = await setPlan(user.id, 'pro');

    for (let index = 0; index < PLANS.pro.maxDomains; index += 1) {
      await assertCanAddDomain(user.id, 'pro', subscription);
      await createDomain(user.id, `site${index}.example-test.com`);
    }

    await expect(
      assertCanAddDomain(user.id, 'pro', subscription),
    ).rejects.toBeInstanceOf(LimitExceededError);
  });

  it('counts each account separately', async () => {
    const a = await createUser();
    const b = await createUser();

    await createDomain(a.user.id, 'shared.example-test.com');
    // Same hostname, different owner: b has used none of its own allowance.
    await expect(
      assertCanAddDomain(b.user.id, 'free', b.subscription),
    ).resolves.toBeUndefined();
  });
});

describe('scan quota', () => {
  it('refuses a scan once the period allowance is spent', async () => {
    const { user, subscription } = await createUser();
    const domain = await createDomain(user.id, 'quota.example-test.com');

    for (let index = 0; index < PLANS.free.scansPerPeriod; index += 1) {
      await assertCanScan(user.id, 'free', subscription);
      await recordScan(user.id, domain.id, domain.hostname);
    }

    await expect(
      assertCanScan(user.id, 'free', subscription),
    ).rejects.toBeInstanceOf(LimitExceededError);
  });

  it('ignores scans from before the current billing period', async () => {
    const { user } = await createUser();
    const subscription = await setPlan(user.id, 'pro');
    const domain = await createDomain(user.id, 'old.example-test.com');

    // Two days before the period started, so outside the window.
    await recordScan(user.id, domain.id, domain.hostname, {
      startedAt: new Date(subscription.currentPeriodStart.getTime() - 2 * 86_400_000),
    });

    const usage = await getUsage(user.id, 'pro', subscription);
    expect(usage.scansUsed).toBe(0);
    expect(usage.scansRemaining).toBe(PLANS.pro.scansPerPeriod);
  });

  it('reports remaining scans accurately', async () => {
    const { user, subscription } = await createUser();
    const domain = await createDomain(user.id, 'count.example-test.com');

    await recordScan(user.id, domain.id, domain.hostname);
    await recordScan(user.id, domain.id, domain.hostname);

    const usage = await getUsage(user.id, 'free', subscription);
    expect(usage.scansUsed).toBe(2);
    expect(usage.scansRemaining).toBe(PLANS.free.scansPerPeriod - 2);
  });
});

describe('scheduling entitlement', () => {
  it('refuses automatic scans on the free plan', () => {
    expect(() => assertFrequencyAllowed('free', 'daily')).toThrow(LimitExceededError);
    expect(() => assertFrequencyAllowed('free', 'weekly')).toThrow(LimitExceededError);
    expect(() => assertFrequencyAllowed('free', 'manual')).not.toThrow();
  });

  it('allows every frequency on paid plans', () => {
    for (const plan of ['pro', 'agency'] as const) {
      for (const frequency of ['manual', 'weekly', 'daily'] as const) {
        expect(() => assertFrequencyAllowed(plan, frequency)).not.toThrow();
      }
    }
  });
});

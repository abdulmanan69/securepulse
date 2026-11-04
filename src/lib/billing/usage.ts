import 'server-only';

import { and, count, eq, gte } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { domains, scans, subscriptions } from '@/lib/db/schema';
import type { Plan, ScanFrequency, Subscription } from '@/lib/db/schema';
import { planFor } from './plans';

/**
 * Server-side enforcement of every plan limit.
 *
 * These functions are the only authority on what a user may do. The UI hides
 * what it should, but hiding a button is presentation, not a limit: each API
 * route calls in here before acting, so a request crafted by hand is refused
 * the same way.
 */

export class LimitExceededError extends Error {
  readonly code: string;
  readonly upgradeHint: boolean;

  constructor(code: string, message: string, upgradeHint = true) {
    super(message);
    this.name = 'LimitExceededError';
    this.code = code;
    this.upgradeHint = upgradeHint;
  }
}

/**
 * Start of the window that scan quota is counted against.
 *
 * For a paying subscriber this is their Stripe billing period, so quota resets
 * when they are charged. For free users there is no billing period, so it
 * falls back to a rolling 30-day window anchored on signup.
 */
export function periodStartFor(subscription: Subscription | null): Date {
  if (subscription?.currentPeriodStart) {
    const start = subscription.currentPeriodStart;
    // A stale period (a webhook we never received) would otherwise grant
    // unlimited quota, so fall back once it is clearly in the past.
    if (Date.now() - start.getTime() < 45 * 24 * 60 * 60 * 1000) {
      return start;
    }
  }
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

export interface UsageSnapshot {
  plan: Plan;
  domainsUsed: number;
  domainsLimit: number;
  scansUsed: number;
  scansLimit: number;
  periodStart: Date;
  scansRemaining: number;
}

export async function getUsage(
  userId: string,
  plan: Plan,
  subscription: Subscription | null,
): Promise<UsageSnapshot> {
  const db = await getDb();
  const definition = planFor(plan);
  const periodStart = periodStartFor(subscription);

  const [domainRow] = await db
    .select({ value: count() })
    .from(domains)
    .where(eq(domains.userId, userId));

  const [scanRow] = await db
    .select({ value: count() })
    .from(scans)
    .where(and(eq(scans.userId, userId), gte(scans.startedAt, periodStart)));

  const scansUsed = scanRow?.value ?? 0;

  return {
    plan,
    domainsUsed: domainRow?.value ?? 0,
    domainsLimit: definition.maxDomains,
    scansUsed,
    scansLimit: definition.scansPerPeriod,
    periodStart,
    scansRemaining: Math.max(0, definition.scansPerPeriod - scansUsed),
  };
}

export async function assertCanAddDomain(
  userId: string,
  plan: Plan,
  subscription: Subscription | null,
): Promise<void> {
  const usage = await getUsage(userId, plan, subscription);
  if (usage.domainsUsed >= usage.domainsLimit) {
    throw new LimitExceededError(
      'domain_limit',
      `Your ${planFor(plan).name} plan covers ${usage.domainsLimit} domain${usage.domainsLimit === 1 ? '' : 's'}. Upgrade to monitor more.`,
    );
  }
}

export async function assertCanScan(
  userId: string,
  plan: Plan,
  subscription: Subscription | null,
): Promise<UsageSnapshot> {
  const usage = await getUsage(userId, plan, subscription);
  if (usage.scansUsed >= usage.scansLimit) {
    throw new LimitExceededError(
      'scan_limit',
      `You have used all ${usage.scansLimit} scans in this period. The allowance resets on ${new Date(usage.periodStart.getTime() + 30 * 86_400_000).toLocaleDateString('en-US')}.`,
    );
  }
  return usage;
}

export function assertFrequencyAllowed(plan: Plan, frequency: ScanFrequency) {
  const definition = planFor(plan);
  if (!definition.allowedFrequencies.includes(frequency)) {
    throw new LimitExceededError(
      'frequency_not_allowed',
      `Automatic ${frequency} scans are part of the Pro plan. The Free plan runs scans on demand.`,
    );
  }
}

export function assertFeature(
  plan: Plan,
  feature: 'aiSummary' | 'pdfReports' | 'whiteLabel' | 'apiAccess' | 'emailAlerts' | 'exposedFileDiscovery',
  label: string,
): void {
  if (!planFor(plan)[feature]) {
    throw new LimitExceededError('feature_not_available', `${label} is available on the Pro and Agency plans.`);
  }
}

/** Creates the free-plan row that every new account starts on. */
export async function ensureSubscription(userId: string): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(subscriptions).values({ userId, plan: 'free', status: 'active' });
  }
}

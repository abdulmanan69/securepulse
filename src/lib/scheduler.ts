import 'server-only';

import { and, eq, inArray, isNull, lte, ne, or } from 'drizzle-orm';

import { resolveActivePlan } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import { getUsage } from '@/lib/billing/usage';
import { getDb } from '@/lib/db';
import { domains, subscriptions, users } from '@/lib/db/schema';
import { sendCertificateExpiryEmail, sendGradeDropEmail } from '@/lib/email/send';
import { createAndRunScan } from '@/lib/scanner/persist';
import { purgeExpiredRateLimits } from '@/lib/util/ratelimit';
import { purgeExpiredSessions } from '@/lib/auth/session';
import { purgeExpiredResets } from '@/lib/auth/password-reset';

/**
 * The scheduled scan run.
 *
 * Scan frequency is the subscription's core value, so this job is the product
 * working. It is written to be safe to run often and safe to run twice:
 *
 *  - Work is selected by "due at or before now", so a missed run catches up
 *    rather than skipping a cycle.
 *  - Each run is capped, so a backlog cannot turn one invocation into
 *    thousands of outbound requests.
 *  - Plan quota is re-checked per domain at execution time. A lapsed
 *    subscription stops consuming scans without anything else having to
 *    notice.
 *  - A failure on one domain never aborts the batch.
 */

const INTERVALS: Record<'daily' | 'weekly', number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/** Upper bound on domains processed in a single invocation. */
const BATCH_LIMIT = 25;

/** Warn this far ahead of certificate expiry. */
const CERT_WARNING_DAYS = 21;

export interface SchedulerReport {
  considered: number;
  scanned: number;
  skippedOverQuota: number;
  failed: number;
  alertsSent: number;
  sessionsPurged: number;
  rateLimitsPurged: number;
  resetTokensPurged: number;
  durationMs: number;
}

export async function runScheduledScans(now = new Date()): Promise<SchedulerReport> {
  const startedAt = Date.now();
  const db = await getDb();

  const dailyCutoff = new Date(now.getTime() - INTERVALS.daily);
  const weeklyCutoff = new Date(now.getTime() - INTERVALS.weekly);

  // Due = never scanned, or last scanned before this frequency's cutoff.
  const due = await db
    .select({
      domain: domains,
      email: users.email,
      userId: users.id,
    })
    .from(domains)
    .innerJoin(users, eq(users.id, domains.userId))
    .where(
      and(
        ne(domains.scanFrequency, 'manual'),
        or(
          isNull(domains.lastScanAt),
          and(eq(domains.scanFrequency, 'daily'), lte(domains.lastScanAt, dailyCutoff)),
          and(eq(domains.scanFrequency, 'weekly'), lte(domains.lastScanAt, weeklyCutoff)),
        ),
      ),
    )
    .limit(BATCH_LIMIT);

  const report: SchedulerReport = {
    considered: due.length,
    scanned: 0,
    skippedOverQuota: 0,
    failed: 0,
    alertsSent: 0,
    sessionsPurged: 0,
    rateLimitsPurged: 0,
    resetTokensPurged: 0,
    durationMs: 0,
  };

  // One subscription lookup for the whole batch rather than one per domain.
  const userIds = [...new Set(due.map((row) => row.userId))];
  const subscriptionRows =
    userIds.length > 0
      ? await db
          .select()
          .from(subscriptions)
          .where(inArray(subscriptions.userId, userIds))
      : [];
  const subscriptionByUser = new Map(
    subscriptionRows.map((row) => [row.userId, row]),
  );

  for (const row of due) {
    const subscription = subscriptionByUser.get(row.userId) ?? null;
    const plan = resolveActivePlan(subscription);
    const definition = planFor(plan);

    // A downgrade (or a lapsed payment) silently stops scheduled scans rather
    // than continuing to spend on someone who is no longer paying.
    if (!definition.allowedFrequencies.includes(row.domain.scanFrequency)) {
      report.skippedOverQuota += 1;
      continue;
    }

    const usage = await getUsage(row.userId, plan, subscription);
    if (usage.scansRemaining <= 0) {
      report.skippedOverQuota += 1;
      continue;
    }

    const previousGrade = row.domain.lastGrade;

    const result = await createAndRunScan({
      userId: row.userId,
      domainId: row.domain.id,
      hostname: row.domain.hostname,
      trigger: 'scheduled',
      verified: !!row.domain.verifiedAt && definition.exposedFileDiscovery,
    });

    if (!result.outcome) {
      report.failed += 1;
      continue;
    }

    report.scanned += 1;

    if (!row.domain.alertsEnabled || !definition.emailAlerts) continue;

    const alerts = await sendAlertsFor({
      userId: row.userId,
      email: row.email,
      hostname: row.domain.hostname,
      previousGrade,
      outcome: result.outcome,
      scanId: result.scanId,
    });
    report.alertsSent += alerts;
  }

  report.sessionsPurged = await purgeExpiredSessions();
  report.rateLimitsPurged = await purgeExpiredRateLimits();
  report.resetTokensPurged = await purgeExpiredResets();
  report.durationMs = Date.now() - startedAt;

  return report;
}

const GRADE_RANK = ['A+', 'A', 'B', 'C', 'D', 'F'];

/** True when `next` is strictly worse than `previous`. */
export function isGradeRegression(
  previous: string | null,
  next: string,
): boolean {
  if (!previous) return false;
  const before = GRADE_RANK.indexOf(previous);
  const after = GRADE_RANK.indexOf(next);
  if (before === -1 || after === -1) return false;
  return after > before;
}

async function sendAlertsFor(params: {
  userId: string;
  email: string;
  hostname: string;
  previousGrade: string | null;
  outcome: Awaited<ReturnType<typeof createAndRunScan>>['outcome'];
  scanId: string;
}): Promise<number> {
  if (!params.outcome) return 0;
  let sent = 0;

  if (isGradeRegression(params.previousGrade, params.outcome.grade)) {
    const topIssues = params.outcome.findings
      .filter((finding) => finding.status === 'fail')
      .slice(0, 5)
      .map((finding) => finding.title);

    await sendGradeDropEmail({
      userId: params.userId,
      to: params.email,
      hostname: params.hostname,
      previousGrade: params.previousGrade as string,
      newGrade: params.outcome.grade,
      newScore: params.outcome.score,
      topIssues,
      scanId: params.scanId,
    });
    sent += 1;
  }

  // Certificate expiry is the single most common cause of a site going down
  // unexpectedly, and it is entirely preventable with notice.
  const days = params.outcome.evidence.tls?.daysUntilExpiry;
  if (typeof days === 'number' && days >= 0 && days <= CERT_WARNING_DAYS) {
    await sendCertificateExpiryEmail({
      userId: params.userId,
      to: params.email,
      hostname: params.hostname,
      daysUntilExpiry: days,
    });
    sent += 1;
  }

  return sent;
}

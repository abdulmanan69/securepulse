import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { getAuth } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import { getUsage } from '@/lib/billing/usage';
import { getDb } from '@/lib/db';
import { domains } from '@/lib/db/schema';
import { createAndRunScan } from '@/lib/scanner/persist';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { rateLimit } from '@/lib/util/ratelimit';
import { clientIp } from '@/lib/util/request';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Scans every site in the account.
 *
 * Runs serially and stops the moment quota runs out, reporting what it did
 * rather than failing the whole batch. A bulk action that silently burns a
 * month of allowance, or dies halfway with no account of itself, is worse
 * than not having the button.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const limit = await rateLimit(
      `bulk-scan:${auth.user.id}`,
      3,
      60 * 60 * 1000,
    );
    if (!limit.allowed) {
      return fail(
        429,
        'Bulk scans are limited to 3 per hour. Individual scans still work.',
        { code: 'rate_limited' },
      );
    }

    const db = await getDb();
    const rows = await db
      .select()
      .from(domains)
      .where(eq(domains.userId, auth.user.id));

    if (rows.length === 0) {
      return fail(400, 'There are no sites to scan yet.', { code: 'no_domains' });
    }

    const usage = await getUsage(auth.user.id, auth.plan, auth.subscription);
    const plan = planFor(auth.plan);

    const results: Array<{
      hostname: string;
      grade: string | null;
      score: number | null;
      scanId: string | null;
      error?: string;
    }> = [];

    let budget = usage.scansRemaining;
    let skipped = 0;

    for (const domain of rows) {
      if (budget <= 0) {
        skipped += 1;
        continue;
      }
      budget -= 1;

      const result = await createAndRunScan({
        userId: auth.user.id,
        domainId: domain.id,
        hostname: domain.hostname,
        trigger: 'manual',
        verified: !!domain.verifiedAt && plan.exposedFileDiscovery,
      });

      results.push({
        hostname: domain.hostname,
        grade: result.outcome?.grade ?? null,
        score: result.outcome?.score ?? null,
        scanId: result.scanId,
        error: result.error,
      });
    }

    await recordAudit({
      userId: auth.user.id,
      action: AUDIT.scanStarted,
      ip: clientIp(request),
      meta: { bulk: true, scanned: results.length, skipped },
    });

    return ok({
      scanned: results.length,
      skipped,
      failed: results.filter((item) => item.error).length,
      results,
    });
  } catch (error) {
    return handleApiError(error, 'scans/bulk');
  }
}

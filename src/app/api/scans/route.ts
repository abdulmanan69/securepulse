import type { NextRequest } from 'next/server';

import { getAuth } from '@/lib/auth/session';
import { assertCanScan } from '@/lib/billing/usage';
import { planFor } from '@/lib/billing/plans';
import { getOwnedDomain } from '@/lib/domains';
import { createAndRunScan } from '@/lib/scanner/persist';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { LIMITS, rateLimit } from '@/lib/util/ratelimit';
import { clientIp } from '@/lib/util/request';
import { runScanSchema } from '@/lib/validation';

export const runtime = 'nodejs';
// A scan makes several network round trips; the default is too tight.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const body = runScanSchema.parse(await request.json());
    const domain = await getOwnedDomain(auth.user.id, body.domainId);
    if (!domain) return fail(404, 'Domain not found.');

    // Two independent gates. The plan quota is the commercial limit; the rate
    // limit stops one account saturating the scanner regardless of quota.
    await assertCanScan(auth.user.id, auth.plan, auth.subscription);

    const limit = await rateLimit(
      `scan:${auth.user.id}`,
      LIMITS.authenticatedScan.limit,
      LIMITS.authenticatedScan.windowMs,
    );
    if (!limit.allowed) {
      return fail(
        429,
        `You can start ${LIMITS.authenticatedScan.limit} scans per hour. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
        { code: 'rate_limited' },
      );
    }

    await recordAudit({
      userId: auth.user.id,
      action: AUDIT.scanStarted,
      targetType: 'domain',
      targetId: domain.id,
      ip: clientIp(request),
      meta: { hostname: domain.hostname },
    });

    // Exposed-file discovery needs both a verified domain and a plan that
    // includes it.
    const verified =
      !!domain.verifiedAt && planFor(auth.plan).exposedFileDiscovery;

    const result = await createAndRunScan({
      userId: auth.user.id,
      domainId: domain.id,
      hostname: domain.hostname,
      trigger: 'manual',
      verified,
    });

    if (!result.outcome) {
      await recordAudit({
        userId: auth.user.id,
        action: AUDIT.scanFailed,
        targetType: 'scan',
        targetId: result.scanId,
        meta: { error: result.error },
      });
      return fail(502, result.error ?? 'The scan could not be completed.', {
        code: 'scan_failed',
      });
    }

    await recordAudit({
      userId: auth.user.id,
      action: AUDIT.scanCompleted,
      targetType: 'scan',
      targetId: result.scanId,
      meta: { grade: result.outcome.grade, score: result.outcome.score },
    });

    return ok({
      scanId: result.scanId,
      score: result.outcome.score,
      grade: result.outcome.grade,
      findings: result.outcome.findings,
      durationMs: result.outcome.durationMs,
      exposedFileDiscovery: verified,
    });
  } catch (error) {
    return handleApiError(error, 'scans/create');
  }
}

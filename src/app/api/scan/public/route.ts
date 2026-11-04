import type { NextRequest } from 'next/server';

import { createAndRunScan } from '@/lib/scanner/persist';
import { normalizeHostname } from '@/lib/scanner/hostname';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { LIMITS, rateLimit } from '@/lib/util/ratelimit';
import { clientIp } from '@/lib/util/request';
import { publicScanSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The free scan on the marketing site. No account required, which is the whole
 * point: it is the lead magnet and the SEO surface.
 *
 * Because it is unauthenticated it is also the most abusable endpoint in the
 * product, so it is the most tightly constrained:
 *   - Rate limited per IP.
 *   - Never runs exposed-file discovery. That requires a verified domain, and
 *     an anonymous caller has proven nothing.
 *   - Only touches the homepage, security.txt and public DNS, which is what
 *     any browser or crawler already does.
 *   - Every request is written to the audit log with its source address.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  try {
    const limit = await rateLimit(
      `public-scan:${ip}`,
      LIMITS.publicScan.limit,
      LIMITS.publicScan.windowMs,
    );

    if (!limit.allowed) {
      return fail(
        429,
        `Free scans are limited to ${LIMITS.publicScan.limit} per hour. Create an account to keep scanning.`,
        { code: 'rate_limited' },
      );
    }

    const body = publicScanSchema.parse(await request.json());
    const hostname = normalizeHostname(body.hostname);

    await recordAudit({
      action: AUDIT.publicScan,
      targetType: 'hostname',
      targetId: hostname,
      ip,
    });

    const result = await createAndRunScan({
      userId: null,
      domainId: null,
      hostname,
      trigger: 'public',
      // Never, on this endpoint. Ownership has not been proven.
      verified: false,
    });

    if (!result.outcome) {
      return fail(502, result.error ?? 'We could not reach that site.', {
        code: 'scan_failed',
      });
    }

    return ok({
      scanId: result.scanId,
      hostname,
      score: result.outcome.score,
      grade: result.outcome.grade,
      findings: result.outcome.findings,
      durationMs: result.outcome.durationMs,
      scansRemainingThisHour: limit.remaining,
    });
  } catch (error) {
    return handleApiError(error, 'scan/public');
  }
}

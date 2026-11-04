import type { NextRequest } from 'next/server';

import { getAuth } from '@/lib/auth/session';
import {
  checkDomainVerification,
  expectedTxtValue,
  markDomainVerified,
} from '@/lib/domains';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { LIMITS, rateLimit } from '@/lib/util/ratelimit';
import { clientIp } from '@/lib/util/request';
import { getOwnedDomain } from '@/lib/domains';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const { id } = await params;
    const domain = await getOwnedDomain(auth.user.id, id);
    if (!domain) return fail(404, 'Domain not found.');

    if (domain.verifiedAt) {
      return ok({ verified: true, alreadyVerified: true });
    }

    // DNS lookups are cheap but not free, and people click this button
    // repeatedly while waiting for propagation.
    const limit = await rateLimit(
      `verify:${domain.id}`,
      LIMITS.domainVerify.limit,
      LIMITS.domainVerify.windowMs,
    );
    if (!limit.allowed) {
      return fail(
        429,
        'Too many verification attempts. DNS changes can take up to an hour to propagate.',
        { code: 'rate_limited' },
      );
    }

    const result = await checkDomainVerification(
      domain.hostname,
      domain.verificationToken,
    );

    if (!result.verified) {
      return ok({
        verified: false,
        expected: expectedTxtValue(domain.verificationToken),
        checkedNames: result.checkedNames,
        foundRecords: result.foundRecords,
        hint: 'DNS changes can take up to an hour to propagate. The record can live at either name.',
      });
    }

    await markDomainVerified(domain.id);
    await recordAudit({
      userId: auth.user.id,
      action: AUDIT.domainVerified,
      targetType: 'domain',
      targetId: domain.id,
      ip: clientIp(request),
      meta: { hostname: domain.hostname },
    });

    return ok({ verified: true });
  } catch (error) {
    return handleApiError(error, 'domains/verify');
  }
}

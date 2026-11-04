import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { getAuth } from '@/lib/auth/session';
import { assertFrequencyAllowed } from '@/lib/billing/usage';
import { getDb } from '@/lib/db';
import { domains } from '@/lib/db/schema';
import { getOwnedDomain } from '@/lib/domains';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { clientIp } from '@/lib/util/request';
import { updateDomainSchema } from '@/lib/validation';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const { id } = await params;
    const domain = await getOwnedDomain(auth.user.id, id);
    // Same response for "does not exist" and "belongs to someone else", so the
    // endpoint cannot be used to discover which domains other accounts track.
    if (!domain) return fail(404, 'Domain not found.');

    const body = updateDomainSchema.parse(await request.json());

    if (body.scanFrequency) {
      assertFrequencyAllowed(auth.plan, body.scanFrequency);
    }

    const db = await getDb();
    const [updated] = await db
      .update(domains)
      .set({
        label: body.label === undefined ? domain.label : (body.label ?? null),
        scanFrequency: body.scanFrequency ?? domain.scanFrequency,
        alertsEnabled: body.alertsEnabled ?? domain.alertsEnabled,
      })
      .where(eq(domains.id, id))
      .returning();

    return ok({ domain: updated });
  } catch (error) {
    return handleApiError(error, 'domains/update');
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const { id } = await params;
    const domain = await getOwnedDomain(auth.user.id, id);
    if (!domain) return fail(404, 'Domain not found.');

    const db = await getDb();
    await db.delete(domains).where(eq(domains.id, id));

    await recordAudit({
      userId: auth.user.id,
      action: AUDIT.domainRemoved,
      targetType: 'domain',
      targetId: id,
      ip: clientIp(request),
      meta: { hostname: domain.hostname },
    });

    return ok({ ok: true });
  } catch (error) {
    return handleApiError(error, 'domains/delete');
  }
}

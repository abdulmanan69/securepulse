import { and, desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { getAuth } from '@/lib/auth/session';
import { assertCanAddDomain } from '@/lib/billing/usage';
import { getDb } from '@/lib/db';
import { domains } from '@/lib/db/schema';
import { expectedTxtValue, generateVerificationToken } from '@/lib/domains';
import { normalizeHostname } from '@/lib/scanner/hostname';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { clientIp } from '@/lib/util/request';
import { addDomainSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const db = await getDb();
    const rows = await db
      .select()
      .from(domains)
      .where(eq(domains.userId, auth.user.id))
      .orderBy(desc(domains.createdAt));

    return ok({ domains: rows });
  } catch (error) {
    return handleApiError(error, 'domains/list');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const body = addDomainSchema.parse(await request.json());
    // Throws InvalidHostnameError or BlockedHostError, both mapped to a 400
    // with a message written for the user.
    const hostname = normalizeHostname(body.hostname);

    await assertCanAddDomain(auth.user.id, auth.plan, auth.subscription);

    const db = await getDb();
    const duplicate = await db
      .select({ id: domains.id })
      .from(domains)
      .where(and(eq(domains.userId, auth.user.id), eq(domains.hostname, hostname)))
      .limit(1);

    if (duplicate.length > 0) {
      return fail(409, 'You are already monitoring that domain.', {
        code: 'duplicate_domain',
      });
    }

    const verificationToken = generateVerificationToken();

    const [created] = await db
      .insert(domains)
      .values({
        userId: auth.user.id,
        hostname,
        label: body.label && body.label.length > 0 ? body.label : null,
        verificationToken,
      })
      .returning();

    await recordAudit({
      userId: auth.user.id,
      action: AUDIT.domainAdded,
      targetType: 'domain',
      targetId: created.id,
      ip: clientIp(request),
      meta: { hostname },
    });

    return ok(
      {
        domain: created,
        verification: {
          recordName: hostname,
          alternativeRecordName: `_securepulse.${hostname}`,
          recordType: 'TXT',
          recordValue: expectedTxtValue(verificationToken),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, 'domains/create');
  }
}

import { count, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { getAuth } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { domains, scans, users } from '@/lib/db/schema';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { clientIp } from '@/lib/util/request';
import { updateAccountSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const body = updateAccountSchema.parse(await request.json());
    const db = await getDb();

    const [updated] = await db
      .update(users)
      .set({
        name: body.name === undefined ? auth.user.name : (body.name ?? null),
        updatedAt: new Date(),
      })
      .where(eq(users.id, auth.user.id))
      .returning({ id: users.id, email: users.email, name: users.name });

    await recordAudit({
      userId: auth.user.id,
      action: AUDIT.accountUpdated,
      ip: clientIp(request),
    });

    return ok({ user: updated });
  } catch (error) {
    return handleApiError(error, 'account/update');
  }
}

/**
 * Account deletion.
 *
 * Cascades to domains, scans, findings and sessions through the schema's
 * foreign keys. Irreversible, so the client must send the exact email address
 * as confirmation rather than relying on a dialog nobody reads.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const body = (await request.json().catch(() => ({}))) as {
      confirmEmail?: string;
    };

    if (body.confirmEmail?.trim().toLowerCase() !== auth.user.email) {
      return fail(400, 'Type your email address exactly to confirm deletion.', {
        code: 'confirmation_mismatch',
      });
    }

    const db = await getDb();

    // Recorded before the row disappears, and deliberately left unattributed
    // afterwards: audit_log sets user_id to null on delete rather than
    // cascading, so the trail survives the account.
    const [domainCount] = await db
      .select({ value: count() })
      .from(domains)
      .where(eq(domains.userId, auth.user.id));
    const [scanCount] = await db
      .select({ value: count() })
      .from(scans)
      .where(eq(scans.userId, auth.user.id));

    await recordAudit({
      userId: auth.user.id,
      action: 'user.deleted',
      ip: clientIp(request),
      meta: {
        domains: domainCount?.value ?? 0,
        scans: scanCount?.value ?? 0,
      },
    });

    await db.delete(users).where(eq(users.id, auth.user.id));

    return ok({ ok: true });
  } catch (error) {
    return handleApiError(error, 'account/delete');
  }
}

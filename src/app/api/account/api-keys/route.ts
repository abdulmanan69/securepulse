import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { createApiKey, listApiKeys } from '@/lib/api-keys';
import { getAuth } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { clientIp } from '@/lib/util/request';

export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Give the key a name.').max(60),
});

/** Keys per account. Bounded so a compromised session cannot mint hundreds. */
const MAX_KEYS = 10;

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');
    return ok({ keys: await listApiKeys(auth.user.id) });
  } catch (error) {
    return handleApiError(error, 'account/api-keys/list');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    if (!planFor(auth.plan).apiAccess) {
      return fail(402, 'API access is part of the Agency plan.', {
        code: 'feature_not_available',
        upgradeHint: true,
      });
    }

    const body = createSchema.parse(await request.json());

    const existing = await listApiKeys(auth.user.id);
    if (existing.filter((key) => !key.revokedAt).length >= MAX_KEYS) {
      return fail(
        400,
        `You can have ${MAX_KEYS} active keys. Revoke one before creating another.`,
        { code: 'key_limit' },
      );
    }

    const created = await createApiKey(auth.user.id, body.name);

    await recordAudit({
      userId: auth.user.id,
      action: AUDIT.apiKeyCreated,
      ip: clientIp(request),
      targetType: 'api_key',
      targetId: created.id,
      meta: { name: body.name },
    });

    // The only time the full key is ever returned.
    return ok({ key: created.key, id: created.id, prefix: created.prefix }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'account/api-keys/create');
  }
}

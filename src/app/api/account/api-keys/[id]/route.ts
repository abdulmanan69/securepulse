import type { NextRequest } from 'next/server';

import { revokeApiKey } from '@/lib/api-keys';
import { getAuth } from '@/lib/auth/session';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { clientIp } from '@/lib/util/request';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const { id } = await params;
    const revoked = await revokeApiKey(auth.user.id, id);
    if (!revoked) return fail(404, 'No active key with that id.');

    await recordAudit({
      userId: auth.user.id,
      action: AUDIT.apiKeyRevoked,
      ip: clientIp(request),
      targetType: 'api_key',
      targetId: id,
    });

    return ok({ ok: true });
  } catch (error) {
    return handleApiError(error, 'account/api-keys/revoke');
  }
}

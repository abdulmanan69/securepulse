import type { NextRequest } from 'next/server';

import { clearSessionCookie, destroySession, getAuth } from '@/lib/auth/session';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { handleApiError, ok } from '@/lib/util/api';
import { clientIp } from '@/lib/util/request';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();

    if (auth) {
      await destroySession(auth.sessionId);
      await recordAudit({
        userId: auth.user.id,
        action: AUDIT.logout,
        ip: clientIp(request),
      });
    } else {
      // Already signed out. Clear the cookie anyway so a stale value does not
      // linger in the browser.
      await clearSessionCookie();
    }

    return ok({ ok: true });
  } catch (error) {
    return handleApiError(error, 'auth/logout');
  }
}

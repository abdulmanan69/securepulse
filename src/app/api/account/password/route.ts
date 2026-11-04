import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  createSession,
  destroyAllSessions,
  getAuth,
  setSessionCookie,
} from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { LIMITS, rateLimit } from '@/lib/util/ratelimit';
import { clientIp, userAgent } from '@/lib/util/request';
import { changePasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const ip = clientIp(request);
    const limit = await rateLimit(
      `password-change:${auth.user.id}`,
      LIMITS.loginAttempt.limit,
      LIMITS.loginAttempt.windowMs,
    );
    if (!limit.allowed) {
      return fail(429, 'Too many attempts. Try again in a few minutes.', {
        code: 'rate_limited',
      });
    }

    const body = changePasswordSchema.parse(await request.json());

    const db = await getDb();
    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, auth.user.id))
      .limit(1);

    if (!user) return fail(401, 'Sign in to continue.');

    // Requiring the current password is what stops a borrowed session, or an
    // unattended laptop, from being turned into permanent account takeover.
    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      return fail(400, 'That is not your current password.', {
        fields: { currentPassword: 'That is not your current password.' },
      });
    }

    if (body.currentPassword === body.newPassword) {
      return fail(400, 'The new password must be different.', {
        fields: { newPassword: 'Choose a password you are not already using.' },
      });
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // Every existing session dies, including this one. A password change is
    // the standard response to "someone else may have my account", and it is
    // worthless if their session keeps working.
    await destroyAllSessions(user.id);

    // Then re-issue one for the person who just proved they know the password,
    // so changing it does not eject them from the page they are on.
    const { token, expiresAt } = await createSession(user.id, {
      ip,
      userAgent: userAgent(request),
    });
    await setSessionCookie(token, expiresAt);

    await recordAudit({
      userId: user.id,
      action: AUDIT.passwordChanged,
      ip,
      targetType: 'user',
      targetId: user.id,
    });

    return ok({ ok: true, otherSessionsSignedOut: true });
  } catch (error) {
    return handleApiError(error, 'account/password');
  }
}

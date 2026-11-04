import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { hashPassword } from '@/lib/auth/password';
import { consumeReset, findValidReset } from '@/lib/auth/password-reset';
import {
  createSession,
  destroyAllSessions,
  setSessionCookie,
} from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { LIMITS, rateLimit } from '@/lib/util/ratelimit';
import { clientIp, userAgent } from '@/lib/util/request';
import { resetPasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  try {
    // Limits guessing against the token itself, not just the request volume.
    const limit = await rateLimit(
      `reset-redeem:${ip}`,
      LIMITS.passwordReset.limit * 4,
      LIMITS.passwordReset.windowMs,
    );
    if (!limit.allowed) {
      return fail(429, 'Too many attempts. Try again later.', {
        code: 'rate_limited',
      });
    }

    const body = resetPasswordSchema.parse(await request.json());
    const reset = await findValidReset(body.token);

    if (!reset) {
      return fail(
        400,
        'That reset link is invalid or has expired. Request a new one.',
        { code: 'invalid_token' },
      );
    }

    // Conditional consume, so two requests racing the same link cannot both
    // set a password.
    const consumed = await consumeReset(reset.id);
    if (!consumed) {
      return fail(400, 'That reset link has already been used.', {
        code: 'token_used',
      });
    }

    const db = await getDb();
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(body.password),
        updatedAt: new Date(),
      })
      .where(eq(users.id, reset.userId));

    // A reset is the standard response to "someone else may be in my account",
    // so every existing session has to die with it.
    await destroyAllSessions(reset.userId);

    const { token, expiresAt } = await createSession(reset.userId, {
      ip,
      userAgent: userAgent(request),
    });
    await setSessionCookie(token, expiresAt);

    await recordAudit({
      userId: reset.userId,
      action: AUDIT.passwordReset,
      ip,
    });

    return ok({ ok: true });
  } catch (error) {
    return handleApiError(error, 'auth/reset-password');
  }
}

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { ensureSubscription } from '@/lib/billing/usage';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { LIMITS, rateLimit } from '@/lib/util/ratelimit';
import { clientIp, userAgent } from '@/lib/util/request';
import { loginSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * A hash of a value nobody can supply. Verified against when the email is
 * unknown so that a missing account costs the same time as a wrong password,
 * which stops the endpoint being used to enumerate registered addresses.
 */
const DUMMY_HASH =
  'scrypt$65536$8$1$YWJjZGVmZ2hpamtsbW5vcA==$' +
  'ZHVtbXloYXNodmFsdWVub3RhcmVhbHBhc3N3b3JkaGFzaGZvcnRpbWluZ29ubHlwYWQ=';

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  try {
    const body = loginSchema.parse(await request.json());

    // Keyed on the email rather than the IP: credential stuffing rotates
    // source addresses but has to keep hitting the same account.
    const limit = await rateLimit(
      `login:${body.email}`,
      LIMITS.loginAttempt.limit,
      LIMITS.loginAttempt.windowMs,
    );
    if (!limit.allowed) {
      return fail(
        429,
        'Too many failed attempts for this account. Try again in a few minutes.',
        { code: 'rate_limited' },
      );
    }

    const db = await getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    const user = rows[0];
    const valid = await verifyPassword(
      body.password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !valid) {
      await recordAudit({
        action: AUDIT.loginFailed,
        ip,
        meta: { email: body.email },
      });
      // One message for both cases. Saying "no such account" would turn this
      // endpoint into a list of who has signed up.
      return fail(401, 'That email and password do not match.', {
        code: 'invalid_credentials',
      });
    }

    // Transparently upgrade a hash created under weaker parameters.
    if (needsRehash(user.passwordHash)) {
      const upgraded = await hashPassword(body.password);
      await db
        .update(users)
        .set({ passwordHash: upgraded, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    await ensureSubscription(user.id);

    const { token, expiresAt } = await createSession(user.id, {
      ip,
      userAgent: userAgent(request),
    });
    await setSessionCookie(token, expiresAt);

    await recordAudit({
      userId: user.id,
      action: AUDIT.login,
      ip,
      targetType: 'user',
      targetId: user.id,
    });

    return ok({
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    return handleApiError(error, 'auth/login');
  }
}

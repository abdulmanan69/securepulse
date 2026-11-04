import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { hashPassword } from '@/lib/auth/password';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { ensureSubscription } from '@/lib/billing/usage';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { sendWelcomeEmail } from '@/lib/email/send';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { LIMITS, rateLimit } from '@/lib/util/ratelimit';
import { clientIp, userAgent } from '@/lib/util/request';
import { signupSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  try {
    const limit = await rateLimit(
      `signup:${ip}`,
      LIMITS.signup.limit,
      LIMITS.signup.windowMs,
    );
    if (!limit.allowed) {
      return fail(429, 'Too many signups from this network. Try again later.', {
        code: 'rate_limited',
      });
    }

    const body = signupSchema.parse(await request.json());
    const db = await getDb();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    if (existing.length > 0) {
      // Deliberately the same shape of response a real signup gets a 409 for.
      // There is no way to hide that an email is registered on a signup form
      // (the account either gets created or it does not), so the honest thing
      // is a clear message rather than a confusing fake success.
      return fail(409, 'An account with that email already exists. Sign in instead.', {
        code: 'email_taken',
      });
    }

    const passwordHash = await hashPassword(body.password);

    const [created] = await db
      .insert(users)
      .values({
        email: body.email,
        passwordHash,
        name: body.name && body.name.length > 0 ? body.name : null,
      })
      .returning({ id: users.id, email: users.email, name: users.name });

    await ensureSubscription(created.id);

    const { token, expiresAt } = await createSession(created.id, {
      ip,
      userAgent: userAgent(request),
    });
    await setSessionCookie(token, expiresAt);

    await recordAudit({
      userId: created.id,
      action: AUDIT.signup,
      ip,
      targetType: 'user',
      targetId: created.id,
    });

    // Non-blocking: a mail provider outage must not fail a signup.
    void sendWelcomeEmail(created.id, created.email, created.name);

    return ok({ user: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'auth/signup');
  }
}

import type { NextRequest } from 'next/server';

import { createPasswordReset, resetUrl } from '@/lib/auth/password-reset';
import { sendPasswordResetEmail } from '@/lib/email/send';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { handleApiError, ok } from '@/lib/util/api';
import { LIMITS, rateLimit } from '@/lib/util/ratelimit';
import { clientIp } from '@/lib/util/request';
import { forgotPasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * Requests a password reset link.
 *
 * Always responds with the same success shape, whether or not the address has
 * an account. Anything else turns this endpoint into a way to test which
 * email addresses are registered, which is exactly the list an attacker wants
 * before trying credential stuffing.
 *
 * Rate limited on both the address and the source, so it cannot be used to
 * mail-bomb one person or to enumerate at volume.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const identicalResponse = ok({
    ok: true,
    message:
      'If that address has an account, a reset link is on its way. It expires in one hour.',
  });

  try {
    const body = forgotPasswordSchema.parse(await request.json());

    const [byEmail, byIp] = await Promise.all([
      rateLimit(
        `reset-email:${body.email}`,
        LIMITS.passwordReset.limit,
        LIMITS.passwordReset.windowMs,
      ),
      rateLimit(
        `reset-ip:${ip}`,
        LIMITS.passwordReset.limit * 3,
        LIMITS.passwordReset.windowMs,
      ),
    ]);

    // Silently stop rather than returning 429: a rate-limit response that only
    // appears for real accounts would leak the same information the identical
    // response exists to hide.
    if (!byEmail.allowed || !byIp.allowed) return identicalResponse;

    const reset = await createPasswordReset(body.email, ip);

    if (reset) {
      await recordAudit({
        userId: reset.userId,
        action: AUDIT.passwordResetRequested,
        ip,
      });
      await sendPasswordResetEmail({
        userId: reset.userId,
        to: body.email,
        name: reset.name,
        url: resetUrl(reset.token),
      });
    }

    return identicalResponse;
  } catch (error) {
    // A malformed email is a validation error and is safe to report.
    return handleApiError(error, 'auth/forgot-password');
  }
}

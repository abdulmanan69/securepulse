import type { NextRequest } from 'next/server';

/**
 * Best-effort client IP.
 *
 * Only the leftmost x-forwarded-for entry is meaningful, and only because the
 * app sits behind a proxy that sets it. It is used for rate limiting and audit
 * records, never for authorisation, because a client can propose any value and
 * only the trusted proxy hop can be believed.
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function userAgent(request: NextRequest): string {
  return request.headers.get('user-agent') ?? 'unknown';
}

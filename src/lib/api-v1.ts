import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { authenticateApiKey, type ApiCaller } from '@/lib/api-keys';
import { rateLimit } from '@/lib/util/ratelimit';

/**
 * Shared wrapper for the public read-only API.
 *
 * Centralises authentication, rate limiting and the response envelope, so a
 * new endpoint cannot accidentally ship without one of them.
 */

const LIMIT = { limit: 120, windowMs: 60 * 1000 };

export function apiError(status: number, message: string, code: string) {
  return NextResponse.json(
    { error: { code, message } },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        // Documented here so a 401 tells an integrator what to send.
        ...(status === 401
          ? { 'www-authenticate': 'Bearer realm="SecurePulse API"' }
          : {}),
      },
    },
  );
}

export async function withApiKey(
  request: NextRequest,
  handler: (caller: ApiCaller) => Promise<NextResponse>,
): Promise<NextResponse> {
  const { caller, reason } = await authenticateApiKey(
    request.headers.get('authorization'),
  );

  if (!caller) {
    return apiError(401, reason ?? 'Unauthorized.', 'unauthorized');
  }

  const limit = await rateLimit(`api:${caller.keyId}`, LIMIT.limit, LIMIT.windowMs);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'rate_limited',
          message: `This key is limited to ${LIMIT.limit} requests per minute.`,
        },
      },
      {
        status: 429,
        headers: {
          'retry-after': String(limit.retryAfterSeconds),
          'cache-control': 'no-store',
        },
      },
    );
  }

  try {
    const response = await handler(caller);
    response.headers.set('cache-control', 'no-store');
    response.headers.set('x-ratelimit-limit', String(limit.limit));
    response.headers.set('x-ratelimit-remaining', String(limit.remaining));
    return response;
  } catch (error) {
    console.error('[api:v1]', error);
    return apiError(500, 'Something went wrong on our end.', 'internal_error');
  }
}

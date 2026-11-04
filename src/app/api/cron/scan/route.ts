import { timingSafeEqual } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { env } from '@/lib/env';
import { runScheduledScans } from '@/lib/scheduler';
import { fail, ok } from '@/lib/util/api';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Invoked by the platform scheduler (vercel.json cron, or any external
 * scheduler that can send the header).
 *
 * Unauthenticated invocation would let anyone drive our outbound scanning, so
 * the shared secret is required and compared in constant time.
 */
function isAuthorized(request: NextRequest): boolean {
  const header =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.headers.get('x-cron-secret') ??
    '';

  const expected = env.CRON_SECRET;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  // The length of a secret is not itself sensitive.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return fail(401, 'Unauthorized.');
  }

  try {
    const report = await runScheduledScans();
    console.info('[cron:scan]', report);
    return ok(report);
  } catch (error) {
    console.error('[cron:scan] run failed', error);
    return fail(500, 'Scheduled run failed.');
  }
}

// Vercel Cron issues GET requests.
export async function GET(request: NextRequest) {
  return POST(request);
}

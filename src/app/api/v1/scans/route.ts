import { and, desc, eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { withApiKey } from '@/lib/api-v1';
import { getDb } from '@/lib/db';
import { scans } from '@/lib/db/schema';

export const runtime = 'nodejs';

/**
 * GET /api/v1/scans - scan history, newest first.
 *
 * Query: ?site=<domainId>&limit=<1-100>
 */
export async function GET(request: NextRequest) {
  return withApiKey(request, async (caller) => {
    const url = request.nextUrl;
    const site = url.searchParams.get('site');
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25),
    );

    const db = await getDb();
    const where = site
      ? and(eq(scans.userId, caller.userId), eq(scans.domainId, site))
      : eq(scans.userId, caller.userId);

    const rows = await db
      .select()
      .from(scans)
      .where(where)
      .orderBy(desc(scans.startedAt))
      .limit(limit);

    return NextResponse.json({
      data: rows.map((row) => ({
        id: row.id,
        siteId: row.domainId,
        hostname: row.hostname,
        status: row.status,
        trigger: row.trigger,
        grade: row.grade,
        score: row.score,
        counts: { pass: row.passCount, warn: row.warnCount, fail: row.failCount },
        startedAt: row.startedAt.toISOString(),
        durationMs: row.durationMs,
      })),
    });
  });
}

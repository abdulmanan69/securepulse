import { and, eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { apiError, withApiKey } from '@/lib/api-v1';
import { getDb } from '@/lib/db';
import { findings, scans } from '@/lib/db/schema';

export const runtime = 'nodejs';

/** GET /api/v1/scans/:id - one scan with its full findings. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiKey(request, async (caller) => {
    const { id } = await params;
    const db = await getDb();

    // Scoped by the key owner, so a valid key cannot read another account.
    const [scan] = await db
      .select()
      .from(scans)
      .where(and(eq(scans.id, id), eq(scans.userId, caller.userId)))
      .limit(1);

    if (!scan) return apiError(404, 'No scan with that id.', 'not_found');

    const rows = await db
      .select()
      .from(findings)
      .where(eq(findings.scanId, scan.id));

    return NextResponse.json({
      data: {
        id: scan.id,
        siteId: scan.domainId,
        hostname: scan.hostname,
        status: scan.status,
        trigger: scan.trigger,
        grade: scan.grade,
        score: scan.score,
        counts: { pass: scan.passCount, warn: scan.warnCount, fail: scan.failCount },
        startedAt: scan.startedAt.toISOString(),
        finishedAt: scan.finishedAt?.toISOString() ?? null,
        durationMs: scan.durationMs,
        error: scan.error,
        findings: rows.map((row) => ({
          checkId: row.checkId,
          category: row.category,
          status: row.status,
          severity: row.severity,
          title: row.title,
          detail: row.detail,
          remediation: row.remediation,
          evidence: row.evidence,
          points: { earned: row.pointsEarned, possible: row.pointsPossible },
        })),
      },
      meta: {
        scope:
          'Passive configuration review of publicly served responses. Not a penetration test.',
      },
    });
  });
}

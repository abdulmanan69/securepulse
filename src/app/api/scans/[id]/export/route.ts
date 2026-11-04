import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { getAuth } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { findings, scans } from '@/lib/db/schema';
import { fail, handleApiError } from '@/lib/util/api';

export const runtime = 'nodejs';

/**
 * Exports one scan as JSON or CSV.
 *
 * Exists because the people paying for this run agencies: they put findings
 * into their own trackers, spreadsheets and client reports, and a product
 * that traps its own output in a web page makes that a copy-paste job.
 */

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // RFC 4180: wrap in quotes and double any internal quote.
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const { id } = await params;
    const format = request.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'json';

    const db = await getDb();
    const [scan] = await db
      .select()
      .from(scans)
      .where(and(eq(scans.id, id), eq(scans.userId, auth.user.id)))
      .limit(1);

    if (!scan) return fail(404, 'Scan not found.');

    const rows = await db
      .select()
      .from(findings)
      .where(eq(findings.scanId, scan.id));

    const stamp = scan.startedAt.toISOString().slice(0, 10);
    const filename = `securepulse-${scan.hostname}-${stamp}.${format}`;

    if (format === 'csv') {
      const header = [
        'check_id',
        'category',
        'status',
        'severity',
        'title',
        'detail',
        'remediation',
        'points_earned',
        'points_possible',
      ];

      const body = rows
        .map((row) =>
          [
            row.checkId,
            row.category,
            row.status,
            row.severity,
            row.title,
            row.detail,
            row.remediation,
            row.pointsEarned,
            row.pointsPossible,
          ]
            .map(csvCell)
            .join(','),
        )
        .join('\r\n');

      return new Response(`${header.join(',')}\r\n${body}\r\n`, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
          // Reports are per-account data; never let a proxy hold a copy.
          'cache-control': 'private, no-store',
        },
      });
    }

    const payload = {
      scan: {
        id: scan.id,
        hostname: scan.hostname,
        grade: scan.grade,
        score: scan.score,
        status: scan.status,
        trigger: scan.trigger,
        startedAt: scan.startedAt.toISOString(),
        finishedAt: scan.finishedAt?.toISOString() ?? null,
        durationMs: scan.durationMs,
        counts: {
          pass: scan.passCount,
          warn: scan.warnCount,
          fail: scan.failCount,
        },
      },
      findings: rows.map((row) => ({
        checkId: row.checkId,
        category: row.category,
        status: row.status,
        severity: row.severity,
        title: row.title,
        detail: row.detail,
        remediation: row.remediation,
        evidence: row.evidence,
        pointsEarned: row.pointsEarned,
        pointsPossible: row.pointsPossible,
      })),
      meta: {
        generatedAt: new Date().toISOString(),
        scope:
          'Passive configuration review of publicly served responses. Not a penetration test.',
      },
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, 'scans/export');
  }
}

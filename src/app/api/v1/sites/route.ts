import { desc, eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { withApiKey } from '@/lib/api-v1';
import { getDb } from '@/lib/db';
import { domains } from '@/lib/db/schema';

export const runtime = 'nodejs';

/** GET /api/v1/sites - every monitored site and its latest grade. */
export async function GET(request: NextRequest) {
  return withApiKey(request, async (caller) => {
    const db = await getDb();
    const rows = await db
      .select()
      .from(domains)
      .where(eq(domains.userId, caller.userId))
      .orderBy(desc(domains.createdAt));

    return NextResponse.json({
      data: rows.map((row) => ({
        id: row.id,
        hostname: row.hostname,
        label: row.label,
        verified: !!row.verifiedAt,
        scanFrequency: row.scanFrequency,
        alertsEnabled: row.alertsEnabled,
        latest: row.lastScanAt
          ? {
              grade: row.lastGrade,
              score: row.lastScore,
              scannedAt: row.lastScanAt.toISOString(),
            }
          : null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });
}

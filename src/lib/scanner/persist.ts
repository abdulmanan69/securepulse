import 'server-only';

import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { domains, findings as findingsTable, scans } from '@/lib/db/schema';
import type { ScanTriggerValue } from './persist-types';
import { runScan } from './engine';
import type { ScanOutcome } from './types';

/**
 * Persists a scan.
 *
 * The scan row is written before the network work starts, so a scan that dies
 * mid-flight leaves a visible failed record instead of vanishing. That also
 * makes the row the unit that usage is counted against, which closes the hole
 * where a user could burn quota-free scans by aborting each request.
 */

export interface PersistedScan {
  scanId: string;
  outcome: ScanOutcome | null;
  error?: string;
}

export async function createAndRunScan(params: {
  userId: string | null;
  domainId: string | null;
  hostname: string;
  trigger: ScanTriggerValue;
  verified: boolean;
}): Promise<PersistedScan> {
  const db = await getDb();

  const [scanRow] = await db
    .insert(scans)
    .values({
      userId: params.userId,
      domainId: params.domainId,
      hostname: params.hostname,
      status: 'running',
      trigger: params.trigger,
    })
    .returning({ id: scans.id });

  const scanId = scanRow.id;

  try {
    const outcome = await runScan(params.hostname, { verified: params.verified });

    await db
      .update(scans)
      .set({
        status: 'complete',
        score: outcome.score,
        grade: outcome.grade,
        passCount: outcome.findings.filter((f) => f.status === 'pass').length,
        warnCount: outcome.findings.filter((f) => f.status === 'warn').length,
        failCount: outcome.findings.filter((f) => f.status === 'fail').length,
        durationMs: outcome.durationMs,
        finishedAt: new Date(),
      })
      .where(eq(scans.id, scanId));

    if (outcome.findings.length > 0) {
      await db.insert(findingsTable).values(
        outcome.findings.map((finding) => ({
          scanId,
          checkId: finding.checkId,
          category: finding.category,
          status: finding.status,
          severity: finding.severity,
          title: finding.title,
          detail: finding.detail,
          evidence: finding.evidence ?? null,
          remediation: finding.remediation ?? null,
          pointsEarned: finding.pointsEarned,
          pointsPossible: finding.pointsPossible,
        })),
      );
    }

    if (params.domainId) {
      await db
        .update(domains)
        .set({
          lastGrade: outcome.grade,
          lastScore: outcome.score,
          lastScanAt: new Date(),
        })
        .where(eq(domains.id, params.domainId));
    }

    return { scanId, outcome };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'The scan could not be completed.';

    await db
      .update(scans)
      .set({ status: 'failed', error: message.slice(0, 500), finishedAt: new Date() })
      .where(eq(scans.id, scanId));

    return { scanId, outcome: null, error: message };
  }
}

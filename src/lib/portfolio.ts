import 'server-only';

import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { domains, findings, scans } from '@/lib/db/schema';
import type { Domain } from '@/lib/db/schema';

/**
 * Aggregate reads for the overview.
 *
 * Kept in one module because these queries fan out across domains, scans and
 * findings, and doing that inside page components is how an N+1 gets written
 * by accident. Everything here takes a userId and scopes on it.
 */

const GRADE_RANK = ['A+', 'A', 'B', 'C', 'D', 'F'];

/** Numeric rank so grades can be sorted and averaged sensibly. */
export function gradeRank(grade: string | null): number {
  const index = grade ? GRADE_RANK.indexOf(grade) : -1;
  return index === -1 ? GRADE_RANK.length : index;
}

export interface PortfolioSummary {
  total: number;
  scanned: number;
  verified: number;
  monitored: number;
  averageScore: number | null;
  worstGrade: string | null;
  gradeCounts: Record<string, number>;
  failing: number;
}

export async function getPortfolioSummary(
  userId: string,
): Promise<{ summary: PortfolioSummary; domains: Domain[] }> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(domains)
    .where(eq(domains.userId, userId))
    .orderBy(desc(domains.createdAt));

  const scored = rows.filter((row) => typeof row.lastScore === 'number');
  const gradeCounts: Record<string, number> = {};
  for (const row of rows) {
    if (!row.lastGrade) continue;
    gradeCounts[row.lastGrade] = (gradeCounts[row.lastGrade] ?? 0) + 1;
  }

  const worstGrade =
    scored.length > 0
      ? scored.reduce((worst, row) =>
          gradeRank(row.lastGrade) > gradeRank(worst.lastGrade) ? row : worst,
        ).lastGrade
      : null;

  return {
    domains: rows,
    summary: {
      total: rows.length,
      scanned: scored.length,
      verified: rows.filter((row) => row.verifiedAt).length,
      monitored: rows.filter((row) => row.scanFrequency !== 'manual').length,
      averageScore:
        scored.length > 0
          ? Math.round(
              scored.reduce((sum, row) => sum + (row.lastScore ?? 0), 0) /
                scored.length,
            )
          : null,
      worstGrade,
      gradeCounts,
      failing: scored.filter((row) => gradeRank(row.lastGrade) >= 3).length,
    },
  };
}

/** The most recent completed scan id for each of a user's domains. */
async function latestScanIds(userId: string): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db
    .select({
      domainId: scans.domainId,
      scanId: scans.id,
      startedAt: scans.startedAt,
    })
    .from(scans)
    .where(and(eq(scans.userId, userId), eq(scans.status, 'complete'), isNotNull(scans.domainId)))
    .orderBy(desc(scans.startedAt));

  const latest = new Map<string, string>();
  for (const row of rows) {
    if (row.domainId && !latest.has(row.domainId)) {
      latest.set(row.domainId, row.scanId);
    }
  }
  return latest;
}

export interface OpenIssue {
  checkId: string;
  title: string;
  severity: string;
  status: string;
  category: string;
  remediation: string | null;
  /** Hostnames affected by this same issue. */
  sites: Array<{ domainId: string; hostname: string; scanId: string }>;
}

/**
 * Every unresolved finding across the portfolio, grouped by check.
 *
 * Grouped rather than listed per site because the useful question for someone
 * managing twelve client sites is "what do I have to fix", and the answer is
 * usually one header missing on nine of them.
 */
export async function getOpenIssues(userId: string): Promise<OpenIssue[]> {
  const db = await getDb();
  const latest = await latestScanIds(userId);
  if (latest.size === 0) return [];

  const scanIds = [...latest.values()];
  const domainByScan = new Map(
    [...latest.entries()].map(([domainId, scanId]) => [scanId, domainId]),
  );

  const [domainRows, findingRows] = await Promise.all([
    db.select().from(domains).where(eq(domains.userId, userId)),
    db
      .select()
      .from(findings)
      .where(
        and(
          inArray(findings.scanId, scanIds),
          inArray(findings.status, ['fail', 'warn']),
        ),
      ),
  ]);

  const hostnameById = new Map(domainRows.map((row) => [row.id, row.hostname]));
  const grouped = new Map<string, OpenIssue>();

  for (const row of findingRows) {
    const domainId = domainByScan.get(row.scanId);
    if (!domainId) continue;

    const existing = grouped.get(row.checkId);
    const site = {
      domainId,
      hostname: hostnameById.get(domainId) ?? 'unknown',
      scanId: row.scanId,
    };

    if (existing) {
      existing.sites.push(site);
    } else {
      grouped.set(row.checkId, {
        checkId: row.checkId,
        title: row.title,
        severity: row.severity,
        status: row.status,
        category: row.category,
        remediation: row.remediation,
        sites: [site],
      });
    }
  }

  const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
  return [...grouped.values()].sort((a, b) => {
    const bySeverity =
      severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return b.sites.length - a.sites.length;
  });
}

export interface ScorePoint {
  scanId: string;
  at: Date;
  score: number;
  grade: string;
}

/** Score history for one domain, oldest first, for the trend chart. */
export async function getScoreHistory(
  userId: string,
  domainId: string,
  limit = 30,
): Promise<ScorePoint[]> {
  const db = await getDb();
  const rows = await db
    .select({
      scanId: scans.id,
      at: scans.startedAt,
      score: scans.score,
      grade: scans.grade,
    })
    .from(scans)
    .where(
      and(
        eq(scans.userId, userId),
        eq(scans.domainId, domainId),
        eq(scans.status, 'complete'),
      ),
    )
    .orderBy(desc(scans.startedAt))
    .limit(limit);

  return rows
    .filter((row) => typeof row.score === 'number' && row.grade)
    .map((row) => ({
      scanId: row.scanId,
      at: row.at,
      score: row.score as number,
      grade: row.grade as string,
    }))
    .reverse();
}

/** Certificates approaching expiry, soonest first. */
export async function getCertificateWatch(
  userId: string,
  withinDays = 45,
): Promise<Array<{ hostname: string; domainId: string; days: number }>> {
  const db = await getDb();
  const latest = await latestScanIds(userId);
  if (latest.size === 0) return [];

  const domainByScan = new Map(
    [...latest.entries()].map(([domainId, scanId]) => [scanId, domainId]),
  );

  const [domainRows, certFindings] = await Promise.all([
    db.select().from(domains).where(eq(domains.userId, userId)),
    db
      .select()
      .from(findings)
      .where(
        and(
          inArray(findings.scanId, [...latest.values()]),
          eq(findings.checkId, 'transport.tls_certificate'),
        ),
      ),
  ]);

  const hostnameById = new Map(domainRows.map((row) => [row.id, row.hostname]));
  const results: Array<{ hostname: string; domainId: string; days: number }> = [];

  for (const row of certFindings) {
    const days = row.evidence?.daysUntilExpiry;
    if (typeof days !== 'number' || days > withinDays) continue;

    const domainId = domainByScan.get(row.scanId);
    if (!domainId) continue;

    results.push({
      domainId,
      hostname: hostnameById.get(domainId) ?? 'unknown',
      days,
    });
  }

  return results.sort((a, b) => a.days - b.days);
}

export interface RecentScan {
  id: string;
  hostname: string;
  domainId: string | null;
  grade: string | null;
  score: number | null;
  status: string;
  trigger: string;
  startedAt: Date;
  failCount: number;
  warnCount: number;
}

export async function getRecentScans(
  userId: string,
  limit = 12,
): Promise<RecentScan[]> {
  const db = await getDb();
  return db
    .select({
      id: scans.id,
      hostname: scans.hostname,
      domainId: scans.domainId,
      grade: scans.grade,
      score: scans.score,
      status: scans.status,
      trigger: scans.trigger,
      startedAt: scans.startedAt,
      failCount: scans.failCount,
      warnCount: scans.warnCount,
    })
    .from(scans)
    .where(eq(scans.userId, userId))
    .orderBy(desc(scans.startedAt))
    .limit(limit);
}

/**
 * Compares a scan against the one immediately before it for the same domain,
 * so a report can say what actually changed rather than only what is true now.
 */
export interface ScanDiff {
  previous: { id: string; grade: string | null; score: number | null; at: Date } | null;
  fixed: Array<{ checkId: string; title: string }>;
  regressed: Array<{ checkId: string; title: string; severity: string }>;
  scoreDelta: number | null;
}

export async function getScanDiff(
  userId: string,
  scanId: string,
  domainId: string | null,
): Promise<ScanDiff> {
  const empty: ScanDiff = { previous: null, fixed: [], regressed: [], scoreDelta: null };
  if (!domainId) return empty;

  const db = await getDb();
  const [current] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, scanId), eq(scans.userId, userId)))
    .limit(1);
  if (!current) return empty;

  const [previous] = await db
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.userId, userId),
        eq(scans.domainId, domainId),
        eq(scans.status, 'complete'),
        sql`${scans.startedAt} < ${current.startedAt}`,
      ),
    )
    .orderBy(desc(scans.startedAt))
    .limit(1);

  if (!previous) return empty;

  const [currentFindings, previousFindings] = await Promise.all([
    db.select().from(findings).where(eq(findings.scanId, current.id)),
    db.select().from(findings).where(eq(findings.scanId, previous.id)),
  ]);

  const previousBad = new Map(
    previousFindings
      .filter((row) => row.status === 'fail' || row.status === 'warn')
      .map((row) => [row.checkId, row]),
  );
  const currentBad = new Map(
    currentFindings
      .filter((row) => row.status === 'fail' || row.status === 'warn')
      .map((row) => [row.checkId, row]),
  );

  return {
    previous: {
      id: previous.id,
      grade: previous.grade,
      score: previous.score,
      at: previous.startedAt,
    },
    // Was a problem, no longer is.
    fixed: [...previousBad.values()]
      .filter((row) => !currentBad.has(row.checkId))
      .map((row) => ({ checkId: row.checkId, title: row.title })),
    // Is a problem now, was not before.
    regressed: [...currentBad.values()]
      .filter((row) => !previousBad.has(row.checkId))
      .map((row) => ({
        checkId: row.checkId,
        title: row.title,
        severity: row.severity,
      })),
    scoreDelta:
      typeof current.score === 'number' && typeof previous.score === 'number'
        ? current.score - previous.score
        : null,
  };
}

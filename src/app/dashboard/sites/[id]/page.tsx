import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DomainSettings } from '@/components/domain-settings';
import { GradeBadge } from '@/components/grade';
import { IconShield } from '@/components/icons';
import { ScoreTrend } from '@/components/score-trend';
import { SectionHeader, StatRow, StatTile } from '@/components/stat-tile';
import { getAuth } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import { expectedTxtValue, getOwnedDomain } from '@/lib/domains';
import { getScoreHistory } from '@/lib/portfolio';
import { getDb } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const metadata = { title: 'Site' };

export default async function SitePage({
  params,
}: PageProps<'/dashboard/sites/[id]'>) {
  const auth = await getAuth();
  if (!auth) return null;

  const { id } = await params;
  const domain = await getOwnedDomain(auth.user.id, id);
  if (!domain) notFound();

  const db = await getDb();
  const [history, scanRows] = await Promise.all([
    getScoreHistory(auth.user.id, domain.id),
    db
      .select({
        id: scans.id,
        grade: scans.grade,
        score: scans.score,
        status: scans.status,
        trigger: scans.trigger,
        startedAt: scans.startedAt,
        failCount: scans.failCount,
        warnCount: scans.warnCount,
        durationMs: scans.durationMs,
      })
      .from(scans)
      .where(eq(scans.domainId, domain.id))
      .orderBy(desc(scans.startedAt))
      .limit(25),
  ]);

  const plan = planFor(auth.plan);
  const best = history.reduce<number | null>(
    (max, point) => (max === null || point.score > max ? point.score : max),
    null,
  );
  const first = history[0];
  const latest = history[history.length - 1];
  const change =
    first && latest && history.length > 1 ? latest.score - first.score : null;

  return (
    <div>
      <Link
        href="/dashboard/sites"
        className="text-[13px] font-medium text-slate hover:text-ink"
      >
        ← Sites
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {domain.lastGrade ? <GradeBadge grade={domain.lastGrade} size="lg" /> : null}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold break-all">
            {domain.hostname}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-slate">
            {domain.lastScanAt
              ? `Last scanned ${new Date(domain.lastScanAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
              : 'Not scanned yet'}
            {domain.verifiedAt ? (
              <span className="inline-flex items-center gap-1 text-pass">
                <IconShield />
                verified
              </span>
            ) : null}
          </p>
        </div>
        <a
          href={`https://${domain.hostname}`}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto hidden h-9 items-center rounded-sm border border-rule-strong bg-surface px-3.5 text-[13px] font-medium transition-colors hover:border-ink sm:inline-flex"
        >
          Visit site
        </a>
      </div>

      <div className="mt-6">
        <StatRow>
          <StatTile label="Current score" value={domain.lastScore ?? '—'} />
          <StatTile label="Best recorded" value={best ?? '—'} />
          <StatTile
            label="Change over period"
            value={change === null ? '—' : `${change > 0 ? '+' : ''}${change}`}
            tone={
              change === null || change === 0
                ? 'neutral'
                : change < 0
                  ? 'alert'
                  : 'pass'
            }
            sub={history.length > 1 ? `across ${history.length} scans` : undefined}
          />
          <StatTile
            label="Schedule"
            value={
              <span className="text-2xl capitalize">
                {domain.scanFrequency === 'manual' ? 'Manual' : domain.scanFrequency}
              </span>
            }
            sub={domain.alertsEnabled ? 'alerts on' : 'alerts off'}
          />
        </StatRow>
      </div>

      {history.length > 1 ? (
        <section className="mt-8">
          <SectionHeader
            title="Score over time"
            description="Each point is a completed scan. The guides are the grade thresholds, so a line crossing one is a grade change."
          />
          <ScoreTrend
            points={history.map((point) => ({
              scanId: point.scanId,
              at: point.at.toISOString(),
              score: point.score,
              grade: point.grade,
            }))}
          />
        </section>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <section>
          <SectionHeader title="Scan history" count={scanRows.length} />
          {scanRows.length === 0 ? (
            <div className="border border-dashed border-rule-strong bg-surface p-8 text-center text-[13.5px] text-slate">
              No scans yet. Use the command palette or the Sites list to run one.
            </div>
          ) : (
            <ul className="divide-y divide-rule border border-rule bg-surface">
              {scanRows.map((scan) => (
                <li key={scan.id}>
                  <Link
                    href={`/dashboard/scans/${scan.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
                  >
                    {scan.grade ? (
                      <GradeBadge grade={scan.grade} size="sm" />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-dashed border-alert/40 font-mono text-[10px] text-alert">
                        !
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[13.5px] tabular-nums">
                        {scan.status === 'complete'
                          ? `${scan.score}/100`
                          : 'Scan failed'}
                      </p>
                      <p className="font-mono text-[11px] text-slate">
                        {new Date(scan.startedAt).toLocaleString('en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                        {' · '}
                        {scan.trigger}
                        {scan.durationMs
                          ? ` · ${(scan.durationMs / 1000).toFixed(1)}s`
                          : ''}
                      </p>
                    </div>
                    {scan.status === 'complete' ? (
                      <span className="shrink-0 font-mono text-[11px] text-slate">
                        {scan.failCount} fail · {scan.warnCount} warn
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <DomainSettings
          domain={domain}
          expectedRecord={expectedTxtValue(domain.verificationToken)}
          allowedFrequencies={[...plan.allowedFrequencies]}
          alertsAvailable={plan.emailAlerts}
        />
      </div>
    </div>
  );
}

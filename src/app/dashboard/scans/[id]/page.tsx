import { and, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FindingsExplorer } from '@/components/findings-explorer';
import { CategoryTable, GradeBadge } from '@/components/grade';
import { IconArrowDown, IconArrowUp, IconCheck } from '@/components/icons';
import { SummaryMarkdown } from '@/components/report';
import { ExportMenu } from '@/components/scan-actions';
import { SectionHeader } from '@/components/stat-tile';
import { generateRemediationSummary } from '@/lib/ai/remediation';
import { getAuth } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import { getDb } from '@/lib/db';
import { findings as findingsTable, scans } from '@/lib/db/schema';
import { getScanDiff } from '@/lib/portfolio';
import { CATEGORY_LABELS } from '@/lib/scanner/score';
import type { CheckCategory, Finding } from '@/lib/scanner/types';

export const runtime = 'nodejs';
export const metadata = { title: 'Scan report' };

export default async function ScanReportPage({
  params,
}: PageProps<'/dashboard/scans/[id]'>) {
  const auth = await getAuth();
  if (!auth) return null;

  const { id } = await params;
  const db = await getDb();

  // Scoped by user id, so another account's scan is a 404 rather than a 403
  // that confirms it exists.
  const [scan] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, id), eq(scans.userId, auth.user.id)))
    .limit(1);

  if (!scan) notFound();

  const rows = await db
    .select()
    .from(findingsTable)
    .where(eq(findingsTable.scanId, scan.id));

  if (scan.status === 'failed') {
    return (
      <div className="mx-auto max-w-2xl pt-6">
        <Link
          href="/dashboard/reports"
          className="text-[13px] font-medium text-slate hover:text-ink"
        >
          ← Reports
        </Link>
        <h1 className="font-display mt-3 text-2xl font-extrabold">Scan failed</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-slate">
          We could not complete a scan of {scan.hostname}. Nothing was recorded
          against your grade.
        </p>
        <p className="mt-4 border border-alert/30 bg-alert-soft px-4 py-3 font-mono text-[13px] text-alert">
          {scan.error ?? 'No further detail was recorded.'}
        </p>
        <p className="mt-4 text-[13.5px] leading-relaxed text-slate">
          The usual causes are a domain that no longer resolves, a firewall
          blocking our request, or a server that took longer than 10 seconds to
          answer.
        </p>
      </div>
    );
  }

  // Category totals are rebuilt from the stored findings rather than stored a
  // second time, so the breakdown can never disagree with the findings shown.
  const totals = new Map<CheckCategory, { earned: number; possible: number }>();
  for (const row of rows) {
    const key = row.category as CheckCategory;
    const current = totals.get(key) ?? { earned: 0, possible: 0 };
    current.earned += row.pointsEarned;
    current.possible += row.pointsPossible;
    totals.set(key, current);
  }

  const categories = [...totals.entries()].map(([category, value]) => ({
    category,
    label: CATEGORY_LABELS[category] ?? category,
    earned: value.earned,
    possible: value.possible,
    percent:
      value.possible > 0 ? Math.round((value.earned / value.possible) * 100) : null,
  }));

  const diff = await getScanDiff(auth.user.id, scan.id, scan.domainId);
  const plan = planFor(auth.plan);

  let summary = scan.summary;
  let summaryNote: string | null = null;

  // Generated once and cached on the row, so reopening never costs another
  // model call.
  if (plan.aiSummary && !summary && scan.status === 'complete') {
    const result = await generateRemediationSummary({
      hostname: scan.hostname,
      grade: scan.grade ?? 'F',
      score: scan.score ?? 0,
      findings: rows as unknown as Finding[],
    });
    summary = result.markdown;
    summaryNote =
      result.source === 'template'
        ? 'Written from the findings by SecurePulse.'
        : null;
    await db.update(scans).set({ summary }).where(eq(scans.id, scan.id));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={
            scan.domainId ? `/dashboard/sites/${scan.domainId}` : '/dashboard/reports'
          }
          className="text-[13px] font-medium text-slate hover:text-ink"
        >
          ← {scan.domainId ? scan.hostname : 'Reports'}
        </Link>
        <div className="flex items-center gap-2">
          <ExportMenu scanId={scan.id} />
          {plan.pdfReports ? (
            <Link
              href={`/report/${scan.id}`}
              className="inline-flex h-9 items-center rounded-sm bg-ink px-4 text-[13px] font-medium text-paper transition-colors hover:bg-ink-hover"
            >
              Client report
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-6 border border-rule bg-surface p-6">
        <GradeBadge grade={scan.grade ?? 'F'} size="xl" />
        <div className="min-w-0">
          <p className="font-mono text-[13px] text-slate">{scan.hostname}</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="font-display text-4xl font-extrabold">
              {scan.score}
              <span className="text-slate">/100</span>
            </p>
            {diff.scoreDelta !== null && diff.scoreDelta !== 0 ? (
              <span
                className={`inline-flex items-center gap-1 font-mono text-[13px] font-semibold ${
                  diff.scoreDelta > 0 ? 'text-pass' : 'text-alert'
                }`}
              >
                {diff.scoreDelta > 0 ? <IconArrowUp /> : <IconArrowDown />}
                {Math.abs(diff.scoreDelta)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[13.5px] text-slate">
            {scan.passCount} passed · {scan.warnCount} need attention ·{' '}
            {scan.failCount} failed
          </p>
          <p className="mt-2 font-mono text-[11px] text-slate">
            {scan.startedAt.toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            {scan.durationMs ? ` · ${(scan.durationMs / 1000).toFixed(1)}s` : ''}
            {' · '}
            {scan.trigger}
          </p>
        </div>
      </div>

      {diff.previous ? (
        <section className="mt-6">
          <SectionHeader
            title="Changed since the last scan"
            description={`Compared with the scan on ${diff.previous.at.toLocaleDateString('en-US', { dateStyle: 'medium' })}, which scored ${diff.previous.score}/100.`}
          />
          {diff.fixed.length === 0 && diff.regressed.length === 0 ? (
            <p className="border border-rule bg-surface px-4 py-3 text-[13.5px] text-slate">
              No checks changed state. The configuration is the same as it was.
            </p>
          ) : (
            <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2">
              <div className="bg-surface p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-pass">
                  Fixed ({diff.fixed.length})
                </p>
                {diff.fixed.length === 0 ? (
                  <p className="mt-2 text-[13px] text-slate">Nothing new resolved.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {diff.fixed.map((item) => (
                      <li
                        key={item.checkId}
                        className="flex items-start gap-2 text-[13.5px]"
                      >
                        <span className="mt-0.5 shrink-0 text-pass">
                          <IconCheck />
                        </span>
                        {item.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-surface p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-alert">
                  New problems ({diff.regressed.length})
                </p>
                {diff.regressed.length === 0 ? (
                  <p className="mt-2 text-[13px] text-slate">Nothing new broke.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {diff.regressed.map((item) => (
                      <li
                        key={item.checkId}
                        className="flex items-start gap-2 text-[13.5px]"
                      >
                        <span className="mt-0.5 shrink-0 text-alert">
                          <IconArrowDown />
                        </span>
                        {item.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <div className="order-2 lg:order-1">
          {summary ? (
            <section className="mb-8 border border-rule bg-surface p-6">
              <h2 className="font-display text-lg font-bold">What to do about it</h2>
              <div className="prose-report mt-3 max-w-[74ch] text-[14px]">
                <SummaryMarkdown markdown={summary} />
              </div>
              {summaryNote ? (
                <p className="mt-3 font-mono text-[11px] text-slate">{summaryNote}</p>
              ) : null}
            </section>
          ) : null}

          {!plan.aiSummary ? (
            <div className="mb-8 border border-signal/25 bg-signal-soft px-4 py-3 text-[13px] leading-relaxed text-signal-ink">
              Pro adds a written summary that orders these findings by risk and
              explains each fix in plain language, plus a client-ready report
              you can hand over with your own name on it.
            </div>
          ) : null}

          <SectionHeader title="Findings" count={rows.length} />
          <FindingsExplorer findings={rows} />
        </div>

        <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-20">
          <div className="border border-rule bg-surface p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
              Score breakdown
            </h2>
            <div className="mt-3">
              <CategoryTable categories={categories} />
            </div>
          </div>

          <div className="border border-rule bg-surface p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
              Scope
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-slate">
              A passive configuration review of what {scan.hostname} serves
              publicly. Not a penetration test: it says nothing about
              application code, dependencies, or who has access to the server.
            </p>
            <Link
              href="/scanning-policy"
              className="mt-2 inline-block text-[12.5px] font-medium text-signal hover:underline"
            >
              Scanning policy →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PrintButton } from '@/components/print-button';
import { GradeBadge, StatusTag } from '@/components/grade';
import { SummaryMarkdown } from '@/components/report';
import { getAuth } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import { getDb } from '@/lib/db';
import { findings as findingsTable, scans } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Security report', robots: { index: false } };

/**
 * The client-facing report.
 *
 * Rendered as a print-optimised document rather than generated server-side as
 * a PDF. A headless browser in a serverless function is a large amount of cost
 * and fragility for a file the browser can already produce perfectly, and this
 * way the customer can read it on screen, send the link, or print to PDF from
 * the same page. Server-side PDF generation is a later addition, not a gap in
 * what this delivers.
 */
export default async function ClientReportPage({
  params,
}: PageProps<'/report/[id]'>) {
  const auth = await getAuth();
  if (!auth) notFound();

  const { id } = await params;
  const db = await getDb();

  const [scan] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, id), eq(scans.userId, auth.user.id)))
    .limit(1);

  if (!scan || scan.status !== 'complete') notFound();

  const plan = planFor(auth.plan);
  if (!plan.pdfReports) notFound();

  const rows = await db
    .select()
    .from(findingsTable)
    .where(eq(findingsTable.scanId, scan.id));

  const needsWork = rows.filter(
    (row) => row.status === 'fail' || row.status === 'warn',
  );
  const passing = rows.filter((row) => row.status === 'pass');

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <p className="text-[13px] text-slate">
          Print this page or save it as PDF to send to your client.
        </p>
        <PrintButton />
      </div>

      <header className="border-b-2 border-ink pb-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate">
              Website security report
            </p>
            <h1 className="font-display mt-1.5 text-3xl font-extrabold">
              {scan.hostname}
            </h1>
            <p className="mt-1 text-[13px] text-slate">
              {scan.startedAt.toLocaleDateString('en-US', { dateStyle: 'long' })}
            </p>
          </div>
          <div className="text-center">
            <GradeBadge grade={scan.grade ?? 'F'} size="lg" />
            <p className="font-display mt-2 text-lg font-bold tabular-nums">
              {scan.score}/100
            </p>
          </div>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-3 gap-px border border-rule bg-rule">
        {[
          { label: 'Passed', value: scan.passCount },
          { label: 'Need attention', value: scan.warnCount },
          { label: 'Failed', value: scan.failCount },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface p-4 text-center">
            <p className="font-display text-2xl font-extrabold tabular-nums">
              {stat.value}
            </p>
            <p className="mt-0.5 text-[12px] text-slate">{stat.label}</p>
          </div>
        ))}
      </section>

      {scan.summary ? (
        <section className="mt-8">
          <div className="prose-report max-w-none text-[14px]">
            <SummaryMarkdown markdown={scan.summary} />
          </div>
        </section>
      ) : null}

      {needsWork.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display border-b border-rule pb-2 text-lg font-bold">
            Items to address
          </h2>
          <ol className="mt-4 space-y-5">
            {needsWork.map((row, index) => (
              <li key={row.id} className="break-inside-avoid">
                <div className="flex items-start gap-3">
                  <span className="font-display mt-0.5 w-6 shrink-0 text-lg font-extrabold text-slate tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold">{row.title}</h3>
                      <StatusTag status={row.status} />
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-slate">
                      {row.detail}
                    </p>
                    {row.remediation ? (
                      <p className="mt-2 border-l-2 border-ink pl-3 text-[13px] leading-relaxed">
                        <span className="font-semibold">Fix: </span>
                        {row.remediation}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display border-b border-rule pb-2 text-lg font-bold">
          Checks passed ({passing.length})
        </h2>
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {passing.map((row) => (
            <li key={row.id} className="flex gap-2 text-[13px]">
              <span aria-hidden="true" className="text-pass">✓</span>
              {row.title}
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-10 border-t border-rule pt-5 text-[11px] leading-relaxed text-slate">
        <p>
          This report is a passive configuration review of what {scan.hostname}{' '}
          serves publicly. It is not a penetration test and does not assess
          application code, server access, or dependencies.
        </p>
        {!plan.whiteLabel ? (
          <p className="mt-2 font-mono">Generated by SecurePulse</p>
        ) : null}
      </footer>
    </div>
  );
}

import Link from 'next/link';

import { GradeBadge, SeverityTag, StatusTag } from '@/components/grade';
import { IconClock, IconPlus, IconShield } from '@/components/icons';
import {
  OnboardingChecklist,
  isOnboardingComplete,
} from '@/components/onboarding';
import { EmptyState, SectionHeader, StatRow, StatTile } from '@/components/stat-tile';
import { getAuth } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import {
  getCertificateWatch,
  getOpenIssues,
  getPortfolioSummary,
  getRecentScans,
} from '@/lib/portfolio';

export const runtime = 'nodejs';
export const metadata = { title: 'Overview' };

function relative(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function OverviewPage() {
  const auth = await getAuth();
  if (!auth) return null;

  const [{ summary, domains }, issues, certWatch, recent] = await Promise.all([
    getPortfolioSummary(auth.user.id),
    getOpenIssues(auth.user.id),
    getCertificateWatch(auth.user.id),
    getRecentScans(auth.user.id, 8),
  ]);

  const plan = planFor(auth.plan);

  const onboarding = {
    hasSite: summary.total > 0,
    hasScan: summary.scanned > 0,
    hasVerified: summary.verified > 0,
    hasSchedule: summary.monitored > 0,
    schedulingAvailable: plan.allowedFrequencies.length > 1,
  };

  if (summary.total === 0) {
    return (
      <div className="mx-auto max-w-2xl pt-8">
        <h1 className="font-display text-3xl font-extrabold">
          Let us look at your first site
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate">
          Add a domain and run a scan. It takes a few seconds and checks twelve
          things across encryption, headers, cookies, page content and email
          DNS. Nothing is exploited and nothing is probed.
        </p>
        <Link
          href="/dashboard/sites?add=1"
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-sm bg-signal px-5 text-sm font-medium text-white transition-colors hover:bg-signal-hover"
        >
          <IconPlus />
          Add your first site
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">Overview</h1>
          <p className="mt-0.5 text-[13.5px] text-slate">
            {summary.total} site{summary.total === 1 ? '' : 's'} ·{' '}
            {summary.monitored} on a schedule · {summary.verified} verified
          </p>
        </div>
        <Link
          href="/dashboard/sites?add=1"
          className="inline-flex h-9 items-center gap-2 rounded-sm border border-rule-strong bg-surface px-3.5 text-[13px] font-medium transition-colors hover:border-ink"
        >
          <IconPlus />
          Add site
        </Link>
      </div>

      {!isOnboardingComplete(onboarding) ? (
        <OnboardingChecklist
          state={onboarding}
          firstSiteId={domains[0]?.id ?? null}
        />
      ) : null}

      <StatRow>
        <StatTile
          label="Average score"
          value={summary.averageScore ?? '—'}
          sub={summary.scanned > 0 ? `across ${summary.scanned} scanned` : 'no scans yet'}
        />
        <StatTile
          label="Worst grade"
          value={summary.worstGrade ?? '—'}
          tone={
            summary.worstGrade && ['D', 'F'].includes(summary.worstGrade)
              ? 'alert'
              : summary.worstGrade === 'C'
                ? 'caution'
                : 'pass'
          }
          sub="lowest in the portfolio"
        />
        <StatTile
          label="Sites needing work"
          value={summary.failing}
          tone={summary.failing > 0 ? 'alert' : 'pass'}
          sub="graded C or below"
        />
        <StatTile
          label="Open issues"
          value={issues.length}
          tone={issues.length > 0 ? 'caution' : 'pass'}
          sub="distinct checks failing"
        />
      </StatRow>

      {certWatch.length > 0 ? (
        <section>
          <SectionHeader
            title="Certificates expiring"
            count={certWatch.length}
            description="When a certificate lapses every visitor sees a full-page browser warning. Most of them leave at that screen."
          />
          <ul className="divide-y divide-rule border border-rule bg-surface">
            {certWatch.map((item) => (
              <li key={item.domainId} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={
                    item.days <= 14 ? 'text-alert' : 'text-caution'
                  }
                >
                  <IconClock />
                </span>
                <Link
                  href={`/dashboard/sites/${item.domainId}`}
                  className="font-mono text-[13.5px] hover:text-signal"
                >
                  {item.hostname}
                </Link>
                <span
                  className={`ml-auto font-mono text-[12px] tabular-nums ${
                    item.days <= 14 ? 'text-alert' : 'text-caution'
                  }`}
                >
                  {item.days <= 0
                    ? 'expired'
                    : `${item.days} day${item.days === 1 ? '' : 's'}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionHeader
          title="What to fix"
          count={issues.length}
          description="Grouped by check rather than by site, because the same header is usually missing on several of them at once."
        />

        {issues.length === 0 ? (
          <EmptyState
            title="Nothing outstanding"
            body="Every completed scan passed every check. Scheduled scans will tell you if that changes."
          />
        ) : (
          <ul className="divide-y divide-rule border border-rule bg-surface">
            {issues.slice(0, 10).map((issue) => (
              <li key={issue.checkId} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusTag status={issue.status as 'fail' | 'warn'} />
                  <SeverityTag
                    severity={
                      issue.severity as 'critical' | 'high' | 'medium' | 'low' | 'info'
                    }
                  />
                  <span className="ml-auto font-mono text-[11px] text-slate">
                    {issue.sites.length} site{issue.sites.length === 1 ? '' : 's'}
                  </span>
                </div>

                <p className="mt-2.5 text-[14.5px] font-semibold">{issue.title}</p>

                {issue.remediation ? (
                  <p className="mt-1 max-w-[74ch] text-[13px] leading-relaxed text-slate">
                    {issue.remediation}
                  </p>
                ) : null}

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {issue.sites.map((site) => (
                    <Link
                      key={`${issue.checkId}-${site.domainId}`}
                      href={`/dashboard/scans/${site.scanId}`}
                      className="rounded-sm border border-rule bg-paper px-2 py-0.5 font-mono text-[11px] text-slate transition-colors hover:border-ink hover:text-ink"
                    >
                      {site.hostname}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        {issues.length > 10 ? (
          <p className="mt-2 text-[13px] text-slate">
            Showing the 10 highest-risk of {issues.length}.{' '}
            <Link href="/dashboard/sites" className="font-medium text-signal hover:underline">
              See every site →
            </Link>
          </p>
        ) : null}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHeader
            title="Your sites"
            count={domains.length}
            action={
              <Link
                href="/dashboard/sites"
                className="text-[13px] font-medium text-signal hover:underline"
              >
                Manage →
              </Link>
            }
          />
          <ul className="divide-y divide-rule border border-rule bg-surface">
            {domains.slice(0, 6).map((domain) => (
              <li key={domain.id}>
                <Link
                  href={`/dashboard/sites/${domain.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
                >
                  {domain.lastGrade ? (
                    <GradeBadge grade={domain.lastGrade} size="sm" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-dashed border-rule-strong font-mono text-[10px] text-slate">
                      —
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[13.5px]">
                      {domain.hostname}
                    </p>
                    <p className="text-[11.5px] text-slate">
                      {domain.lastScanAt
                        ? `${domain.lastScore}/100 · ${relative(domain.lastScanAt)}`
                        : 'Never scanned'}
                      {domain.scanFrequency !== 'manual'
                        ? ` · ${domain.scanFrequency}`
                        : ''}
                    </p>
                  </div>
                  {domain.verifiedAt ? (
                    <span className="shrink-0 text-pass" title="Ownership verified">
                      <IconShield />
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeader
            title="Recent scans"
            action={
              <Link
                href="/dashboard/reports"
                className="text-[13px] font-medium text-signal hover:underline"
              >
                All reports →
              </Link>
            }
          />
          {recent.length === 0 ? (
            <EmptyState title="No scans yet" body="Run one from your sites list." />
          ) : (
            <ul className="divide-y divide-rule border border-rule bg-surface">
              {recent.map((scan) => (
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
                      <p className="truncate font-mono text-[13.5px]">
                        {scan.hostname}
                      </p>
                      <p className="text-[11.5px] text-slate">
                        {scan.status === 'complete'
                          ? `${scan.failCount} fail · ${scan.warnCount} warn`
                          : 'Scan failed'}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-slate">
                      {relative(scan.startedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {auth.plan === 'free' ? (
        <section className="border border-signal/25 bg-signal-soft p-5">
          <h2 className="font-display text-[16px] font-bold text-signal-ink">
            Scans only run when you click
          </h2>
          <p className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed text-signal-ink">
            On the {plan.name} plan nothing is checked automatically. The value
            of monitoring is catching the change you did not know about, which
            needs a schedule and an alert.
          </p>
          <Link
            href="/dashboard/billing"
            className="mt-4 inline-flex h-9 items-center rounded-sm bg-signal px-4 text-[13px] font-medium text-white transition-colors hover:bg-signal-hover"
          >
            Turn on daily monitoring
          </Link>
        </section>
      ) : null}
    </div>
  );
}

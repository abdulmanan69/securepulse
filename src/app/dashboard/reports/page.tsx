import { and, count, desc, eq } from 'drizzle-orm';
import Link from 'next/link';

import { GradeBadge } from '@/components/grade';
import { EmptyState, SectionHeader } from '@/components/stat-tile';
import { getAuth } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { scans } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const metadata = { title: 'Reports' };

const PAGE_SIZE = 25;

const TRIGGERS = [
  { key: 'all', label: 'All' },
  { key: 'manual', label: 'Manual' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'public', label: 'Public' },
] as const;

export default async function ReportsPage({
  searchParams,
}: PageProps<'/dashboard/reports'>) {
  const auth = await getAuth();
  if (!auth) return null;

  const params = await searchParams;
  const trigger =
    typeof params.trigger === 'string' &&
    ['manual', 'scheduled', 'public'].includes(params.trigger)
      ? (params.trigger as 'manual' | 'scheduled' | 'public')
      : null;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const db = await getDb();
  const where = trigger
    ? and(eq(scans.userId, auth.user.id), eq(scans.trigger, trigger))
    : eq(scans.userId, auth.user.id);

  // Paginated server-side: scan history grows without bound, unlike the
  // domain list which is capped by the plan.
  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(scans)
      .where(where)
      .orderBy(desc(scans.startedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(scans).where(where),
  ]);

  const total = totals?.value ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const linkFor = (next: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    if (trigger) query.set('trigger', trigger);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) query.delete(key);
      else query.set(key, String(value));
    }
    const string = query.toString();
    return string ? `/dashboard/reports?${string}` : '/dashboard/reports';
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-extrabold">Reports</h1>
        <p className="mt-0.5 text-[13.5px] text-slate">
          Every scan this account has run, newest first.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TRIGGERS.map((item) => {
          const active = (trigger ?? 'all') === item.key;
          return (
            <Link
              key={item.key}
              href={
                item.key === 'all'
                  ? '/dashboard/reports'
                  : `/dashboard/reports?trigger=${item.key}`
              }
              className={`inline-flex h-7 items-center rounded-sm border px-2.5 text-[12px] transition-colors ${
                active
                  ? 'border-ink bg-ink text-paper'
                  : 'border-rule-strong bg-surface text-slate hover:border-ink hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No reports yet"
          body="Run a scan from the Sites page or with the command palette, and it will appear here."
        />
      ) : (
        <>
          <SectionHeader title="Scans" count={total} />
          <ul className="divide-y divide-rule border border-rule bg-surface">
            {rows.map((scan) => (
              <li key={scan.id}>
                <Link
                  href={`/dashboard/scans/${scan.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
                >
                  {scan.grade ? (
                    <GradeBadge grade={scan.grade} size="sm" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-dashed border-alert/40 font-mono text-[10px] text-alert">
                      !
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[13.5px] font-medium">
                      {scan.hostname}
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
                    <div className="flex shrink-0 items-center gap-3 font-mono text-[11.5px]">
                      <span className="tabular-nums">
                        {scan.score}
                        <span className="text-slate">/100</span>
                      </span>
                      <span className="text-alert">{scan.failCount} fail</span>
                      <span className="text-caution">{scan.warnCount} warn</span>
                      <span className="text-pass">{scan.passCount} pass</span>
                    </div>
                  ) : (
                    <span className="shrink-0 font-mono text-[11.5px] text-alert">
                      failed
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <p className="font-mono text-[12px] text-slate">
                Page {page} of {pages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={linkFor({ page: page - 1 })}
                    className="inline-flex h-8 items-center rounded-sm border border-rule-strong bg-surface px-3 text-[13px] hover:border-ink"
                  >
                    Previous
                  </Link>
                ) : null}
                {page < pages ? (
                  <Link
                    href={linkFor({ page: page + 1 })}
                    className="inline-flex h-8 items-center rounded-sm border border-rule-strong bg-surface px-3 text-[13px] hover:border-ink"
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

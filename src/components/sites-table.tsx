'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { GradeBadge } from '@/components/grade';
import { IconPlus, IconSearch, IconShield } from '@/components/icons';
import { Button, inputClass } from '@/components/primitives';
import { BulkScanButton } from '@/components/scan-actions';
import { useToast } from '@/components/toast';
import type { Domain } from '@/lib/db/schema';

/**
 * The sites table.
 *
 * Search, filter and sort are client-side deliberately: plan limits cap a
 * portfolio at 25 domains, so the whole set is already in memory and a round
 * trip per keystroke would be slower and worse. Revisit if limits change.
 */

type SortKey = 'grade' | 'hostname' | 'lastScan';
type Filter = 'all' | 'needs-work' | 'unverified' | 'unmonitored' | 'never-scanned';

const GRADE_RANK = ['A+', 'A', 'B', 'C', 'D', 'F'];
const rank = (grade: string | null) =>
  grade ? GRADE_RANK.indexOf(grade) : GRADE_RANK.length;

export function SitesTable({
  domains,
  canAddMore,
  limitMessage,
}: {
  domains: Domain[];
  canAddMore: boolean;
  limitMessage: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { push } = useToast();

  const [showAdd, setShowAdd] = useState(params.get('add') === '1');
  const [hostname, setHostname] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('grade');

  const counts = useMemo(
    () => ({
      all: domains.length,
      'needs-work': domains.filter((d) => rank(d.lastGrade) >= 3).length,
      unverified: domains.filter((d) => !d.verifiedAt).length,
      unmonitored: domains.filter((d) => d.scanFrequency === 'manual').length,
      'never-scanned': domains.filter((d) => !d.lastScanAt).length,
    }),
    [domains],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    let rows = domains.filter((domain) =>
      term ? domain.hostname.toLowerCase().includes(term) : true,
    );

    if (filter === 'needs-work') rows = rows.filter((d) => rank(d.lastGrade) >= 3);
    if (filter === 'unverified') rows = rows.filter((d) => !d.verifiedAt);
    if (filter === 'unmonitored') rows = rows.filter((d) => d.scanFrequency === 'manual');
    if (filter === 'never-scanned') rows = rows.filter((d) => !d.lastScanAt);

    return [...rows].sort((a, b) => {
      if (sort === 'hostname') return a.hostname.localeCompare(b.hostname);
      if (sort === 'lastScan') {
        return (b.lastScanAt?.getTime() ?? 0) - (a.lastScanAt?.getTime() ?? 0);
      }
      // Worst grade first: that is the thing you came here to deal with.
      const byGrade = rank(b.lastGrade) - rank(a.lastGrade);
      return byGrade !== 0 ? byGrade : a.hostname.localeCompare(b.hostname);
    });
  }, [domains, query, filter, sort]);

  async function addDomain(event: React.FormEvent) {
    event.preventDefault();
    if (adding) return;
    setAdding(true);
    setError(null);

    const response = await fetch('/api/domains', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hostname }),
    });
    const data = await response.json();
    setAdding(false);

    if (!response.ok) {
      setError(data.error ?? 'That domain could not be added.');
      return;
    }
    push({
      tone: 'success',
      title: `${data.domain.hostname} added`,
      body: 'Run a scan to see its first report.',
    });
    setHostname('');
    setShowAdd(false);
    router.refresh();
  }

  async function runScan(domainId: string) {
    setScanningId(domainId);
    setError(null);
    const response = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domainId }),
    });
    const data = await response.json();
    setScanningId(null);
    if (!response.ok) {
      setError(data.error ?? 'The scan could not be completed.');
      push({
        tone: 'error',
        title: 'Scan failed',
        body: data.error ?? 'The scan could not be completed.',
      });
      return;
    }
    push({
      tone: data.grade && ['A+', 'A', 'B'].includes(data.grade) ? 'success' : 'info',
      title: `Scan complete: grade ${data.grade}`,
      body: `${data.score}/100`,
    });
    router.push(`/dashboard/scans/${data.scanId}`);
  }

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'needs-work', label: 'Needs work' },
    { key: 'never-scanned', label: 'Never scanned' },
    { key: 'unverified', label: 'Unverified' },
    { key: 'unmonitored', label: 'No schedule' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate">
            <IconSearch />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by hostname"
            aria-label="Filter sites by hostname"
            className={`${inputClass} h-9 py-0 pl-9 font-mono text-[13px]`}
          />
        </div>

        <label className="sr-only" htmlFor="sites-sort">
          Sort sites
        </label>
        <select
          id="sites-sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="h-9 rounded-sm border border-rule-strong bg-surface px-2.5 text-[13px]"
        >
          <option value="grade">Worst grade first</option>
          <option value="lastScan">Recently scanned</option>
          <option value="hostname">Hostname A–Z</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <BulkScanButton siteCount={domains.length} />
          <Button
            size="sm"
            onClick={() => setShowAdd((value) => !value)}
            disabled={!canAddMore}
            className="gap-1.5"
          >
            <IconPlus />
            Add site
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`h-7 rounded-sm border px-2.5 text-[12px] transition-colors ${
              filter === item.key
                ? 'border-ink bg-ink text-paper'
                : 'border-rule-strong bg-surface text-slate hover:border-ink hover:text-ink'
            }`}
          >
            {item.label}
            <span className="ml-1.5 font-mono text-[10.5px] opacity-70">
              {counts[item.key]}
            </span>
          </button>
        ))}
      </div>

      {showAdd ? (
        <form
          onSubmit={addDomain}
          className="mt-4 border border-signal/30 bg-signal-soft/40 p-4"
        >
          <label htmlFor="new-domain" className="block text-[13px] font-medium">
            Add a site to monitor
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="new-domain"
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              placeholder="client-site.com"
              spellCheck={false}
              autoFocus
              disabled={!canAddMore}
              className={`${inputClass} font-mono`}
            />
            <Button
              type="submit"
              disabled={!canAddMore || adding || hostname.trim().length === 0}
              className="shrink-0 whitespace-nowrap sm:w-32"
            >
              {adding ? 'Adding…' : 'Add site'}
            </Button>
          </div>
          <p className="mt-2 text-[12.5px] text-slate">{limitMessage}</p>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 border border-alert/30 bg-alert-soft px-3 py-2 text-[13px] text-alert"
        >
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="mt-4 border border-dashed border-rule-strong bg-surface p-10 text-center">
          <p className="font-display text-[15px] font-bold">
            {domains.length === 0 ? 'No sites yet' : 'Nothing matches that filter'}
          </p>
          <p className="mx-auto mt-1.5 max-w-[44ch] text-[13.5px] leading-relaxed text-slate">
            {domains.length === 0
              ? 'Add a domain above. The first scan takes a few seconds.'
              : 'Clear the filter to see the rest of your sites.'}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto border border-rule bg-surface">
          <table className="w-full min-w-[42rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-rule">
                {['Site', 'Score', 'Last scan', 'Schedule', 'Ownership', ''].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-slate"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {visible.map((domain) => (
                <tr key={domain.id} className="transition-colors hover:bg-paper">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {domain.lastGrade ? (
                        <GradeBadge grade={domain.lastGrade} size="sm" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-dashed border-rule-strong font-mono text-[10px] text-slate">
                          —
                        </span>
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/sites/${domain.id}`}
                          className="font-mono text-[13.5px] font-medium hover:text-signal"
                        >
                          {domain.hostname}
                        </Link>
                        {domain.label ? (
                          <p className="truncate text-[12px] text-slate">
                            {domain.label}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 font-mono text-[13px] tabular-nums">
                    {typeof domain.lastScore === 'number' ? (
                      <>
                        {domain.lastScore}
                        <span className="text-slate">/100</span>
                      </>
                    ) : (
                      <span className="text-slate">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3 font-mono text-[12px] text-slate">
                    {domain.lastScanAt
                      ? new Date(domain.lastScanAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'never'}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`font-mono text-[12px] ${
                        domain.scanFrequency === 'manual' ? 'text-slate' : 'text-pass'
                      }`}
                    >
                      {domain.scanFrequency === 'manual'
                        ? 'on demand'
                        : domain.scanFrequency}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {domain.verifiedAt ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-pass">
                        <IconShield />
                        verified
                      </span>
                    ) : (
                      <Link
                        href={`/dashboard/sites/${domain.id}`}
                        className="font-mono text-[12px] text-caution hover:underline"
                      >
                        verify →
                      </Link>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runScan(domain.id)}
                      disabled={scanningId !== null}
                    >
                      {scanningId === domain.id ? 'Scanning…' : 'Scan'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

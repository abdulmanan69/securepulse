'use client';

import { useMemo, useState } from 'react';

import { SeverityTag, StatusTag } from '@/components/grade';
import { IconCheck, IconCopy } from '@/components/icons';
import type { Finding } from '@/lib/db/schema';

/**
 * The findings list.
 *
 * A report with eighteen findings is a wall unless the reader can cut it down,
 * so status, severity and category are all filterable and the counts are shown
 * on the controls. Default view is "needs attention", because nobody opens a
 * report to read what already passed.
 */

type StatusFilter = 'attention' | 'all' | 'fail' | 'warn' | 'pass';

const CATEGORY_LABELS: Record<string, string> = {
  transport: 'Encryption',
  headers: 'Headers',
  cookies: 'Cookies',
  disclosure: 'Disclosure',
  content: 'Content',
  email_dns: 'Email & DNS',
  policy: 'Policy',
  exposure: 'Exposed files',
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard access can be denied; the text is on screen regardless.
        }
      }}
      className="inline-flex items-center gap-1.5 text-[11.5px] text-slate transition-colors hover:text-ink"
      aria-label={label}
    >
      {copied ? <IconCheck /> : <IconCopy />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence).filter(
    ([, value]) =>
      value !== null && value !== undefined && value !== '' &&
      !(Array.isArray(value) && value.length === 0),
  );
  if (entries.length === 0) return null;

  const asText = entries
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join('\n');

  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer text-[12px] text-slate transition-colors hover:text-ink">
        What we observed
      </summary>
      <div className="mt-2 border border-rule bg-paper">
        <div className="flex items-center justify-between border-b border-rule px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
            Evidence
          </span>
          <CopyButton text={asText} label="Copy evidence" />
        </div>
        <dl className="p-3">
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-wrap gap-x-2 py-0.5 font-mono text-[11px]">
              <dt className="text-slate">{key}:</dt>
              <dd className="min-w-0 break-all">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

export function FindingsExplorer({ findings }: { findings: Finding[] }) {
  const [status, setStatus] = useState<StatusFilter>('attention');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => ({
      all: findings.length,
      attention: findings.filter((f) => f.status === 'fail' || f.status === 'warn').length,
      fail: findings.filter((f) => f.status === 'fail').length,
      warn: findings.filter((f) => f.status === 'warn').length,
      pass: findings.filter((f) => f.status === 'pass').length,
    }),
    [findings],
  );

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const finding of findings) {
      map.set(finding.category, (map.get(finding.category) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [findings]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return findings.filter((finding) => {
      if (status === 'attention' && finding.status !== 'fail' && finding.status !== 'warn') {
        return false;
      }
      if (status !== 'attention' && status !== 'all' && finding.status !== status) {
        return false;
      }
      if (category !== 'all' && finding.category !== category) return false;
      if (term && !`${finding.title} ${finding.detail} ${finding.checkId}`.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [findings, status, category, query]);

  const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
    { key: 'attention', label: 'Needs attention' },
    { key: 'fail', label: 'Failed' },
    { key: 'warn', label: 'Warnings' },
    { key: 'pass', label: 'Passed' },
    { key: 'all', label: 'Everything' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatus(tab.key)}
            className={`inline-flex h-7 items-center rounded-sm border px-2.5 text-[12px] transition-colors ${
              status === tab.key
                ? 'border-ink bg-ink text-paper'
                : 'border-rule-strong bg-surface text-slate hover:border-ink hover:text-ink'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 font-mono text-[10.5px] opacity-70">
              {counts[tab.key]}
            </span>
          </button>
        ))}

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search findings"
          aria-label="Search findings"
          className="ml-auto h-7 w-full max-w-[14rem] rounded-sm border border-rule-strong bg-surface px-2.5 text-[12px] outline-none focus:border-signal"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={`h-6 rounded-sm px-2 text-[11.5px] transition-colors ${
            category === 'all' ? 'bg-signal-soft text-signal-ink' : 'text-slate hover:text-ink'
          }`}
        >
          All categories
        </button>
        {categories.map(([key, total]) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={`h-6 rounded-sm px-2 text-[11.5px] transition-colors ${
              category === key ? 'bg-signal-soft text-signal-ink' : 'text-slate hover:text-ink'
            }`}
          >
            {CATEGORY_LABELS[key] ?? key}
            <span className="ml-1 font-mono text-[10px] opacity-70">{total}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="mt-4 border border-dashed border-rule-strong bg-surface p-10 text-center">
          <p className="font-display text-[15px] font-bold">
            {status === 'attention' ? 'Nothing needs attention' : 'No findings match'}
          </p>
          <p className="mx-auto mt-1.5 max-w-[44ch] text-[13.5px] text-slate">
            {status === 'attention'
              ? 'Every check on this scan passed. Switch to Everything to read them.'
              : 'Clear the filters to see the rest of this report.'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-rule border border-rule bg-surface">
          {visible.map((finding) => (
            <li key={finding.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusTag status={finding.status} />
                <SeverityTag severity={finding.severity} />
                <span className="ml-auto font-mono text-[11px] text-slate">
                  {finding.checkId}
                </span>
                {finding.pointsPossible > 0 ? (
                  <span className="font-mono text-[11px] tabular-nums text-slate">
                    {finding.pointsEarned}/{finding.pointsPossible} pts
                  </span>
                ) : null}
              </div>

              <h3 className="mt-3 text-[15px] font-semibold">{finding.title}</h3>
              <p className="mt-1.5 max-w-[74ch] text-[13.5px] leading-relaxed text-slate">
                {finding.detail}
              </p>

              {finding.remediation ? (
                <div className="mt-3 border-l-2 border-signal bg-signal-soft/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
                      How to fix it
                    </p>
                    <CopyButton
                      text={finding.remediation}
                      label={`Copy the fix for ${finding.title}`}
                    />
                  </div>
                  <p className="mt-1 max-w-[74ch] text-[13px] leading-relaxed">
                    {finding.remediation}
                  </p>
                </div>
              ) : null}

              {finding.evidence ? <Evidence evidence={finding.evidence} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

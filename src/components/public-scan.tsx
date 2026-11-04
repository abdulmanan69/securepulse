'use client';

import Link from 'next/link';
import { useState } from 'react';

import { GradeBadge, StatusTag } from '@/components/grade';
import { Readout, SAMPLE_READOUT, findingsToReadout } from '@/components/readout';
import { Button, inputClass } from '@/components/primitives';
import type { Finding } from '@/lib/scanner/types';

interface ScanResponse {
  scanId: string;
  hostname: string;
  score: number;
  grade: string;
  findings: Finding[];
  durationMs: number;
  scansRemainingThisHour: number;
}

export function PublicScan() {
  const [input, setInput] = useState('');
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runScan(event: React.FormEvent) {
    event.preventDefault();
    if (state === 'running') return;

    setState('running');
    setMessage(null);

    try {
      const response = await fetch('/api/scan/public', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostname: input }),
      });
      const data = await response.json();

      if (!response.ok) {
        setState('error');
        setMessage(data.error ?? 'That scan could not be completed.');
        return;
      }

      setResult(data as ScanResponse);
      setState('done');
    } catch {
      setState('error');
      setMessage('We could not reach the scanner. Check your connection and try again.');
    }
  }

  const rows = result ? findingsToReadout(result.findings) : SAMPLE_READOUT;
  const displayHost = result?.hostname ?? 'your-site.com';

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate">
          Free scan · no account needed
        </p>
        <h1 className="font-display mt-4 text-[2.5rem] leading-[1.04] font-extrabold sm:text-[3.5rem]">
          Your site was secure
          <br />
          the day you launched it.
        </h1>
        <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-slate">
          Certificates expire. Headers vanish in a redeploy. DNS records drift.
          SecurePulse checks twelve things every day and emails you the moment
          the grade drops, so you find out before your client does.
        </p>

        <form onSubmit={runScan} className="mt-8">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="scan-host" className="sr-only">
              Domain to scan
            </label>
            <input
              id="scan-host"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="example.com"
              autoComplete="url"
              spellCheck={false}
              className={`${inputClass} font-mono sm:h-12 sm:py-0`}
              required
            />
            <Button
              type="submit"
              size="lg"
              disabled={state === 'running' || input.trim().length === 0}
              className="shrink-0 whitespace-nowrap sm:w-44"
            >
              {state === 'running' ? 'Scanning…' : 'Scan my site'}
            </Button>
          </div>
          <p className="mt-2.5 text-[13px] text-slate">
            Reads only what your server already sends to any browser. Nothing is
            probed, nothing is exploited.
          </p>
        </form>

        {message ? (
          <p className="mt-4 border border-alert/30 bg-alert-soft px-4 py-3 text-[13px] text-alert">
            {message}
          </p>
        ) : null}

        {result ? <ScanSummary result={result} /> : null}
      </div>

      <div className="lg:pt-14">
        <Readout
          rows={rows}
          hostname={displayHost}
          caption={
            result
              ? `Live response from ${result.hostname}, read in ${(result.durationMs / 1000).toFixed(1)}s.`
              : 'Example response. Dashed rows are headers the server never sent.'
          }
        />
        {!result ? (
          <p className="mt-3 text-[13px] leading-relaxed text-slate">
            Most of a site&rsquo;s security posture is defined by what the
            server leaves out. The dashed rows are the gaps.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ScanSummary({ result }: { result: ScanResponse }) {
  const failures = result.findings.filter((finding) => finding.status === 'fail');
  const warnings = result.findings.filter((finding) => finding.status === 'warn');
  const passes = result.findings.filter((finding) => finding.status === 'pass');

  return (
    <div className="mt-8 border border-rule bg-surface">
      <div className="flex items-center gap-5 border-b border-rule p-5">
        <GradeBadge grade={result.grade} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-mono text-[13px] text-slate">
            {result.hostname}
          </p>
          <p className="font-display text-2xl font-bold">
            {result.score}
            <span className="text-slate">/100</span>
          </p>
          <p className="mt-0.5 text-[13px] text-slate">
            {passes.length} passed · {warnings.length} need attention ·{' '}
            {failures.length} failed
          </p>
        </div>
      </div>

      <ul className="divide-y divide-rule">
        {[...failures, ...warnings].slice(0, 5).map((finding) => (
          <li key={finding.checkId} className="flex gap-3 p-4">
            <StatusTag status={finding.status} />
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{finding.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate">
                {finding.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-rule bg-paper p-5">
        <p className="text-[14px] font-medium">
          {failures.length + warnings.length > 5
            ? `${failures.length + warnings.length - 5} more findings in the full report.`
            : 'Keep this from drifting back.'}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate">
          A one-off scan tells you about today. Create a free account to keep
          the history, or start monitoring to get an email the moment this grade
          falls.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/signup?domain=${encodeURIComponent(result.hostname)}`}
            className="inline-flex h-10 items-center justify-center rounded-sm bg-signal px-4 text-sm font-medium text-white transition-colors hover:bg-signal-hover"
          >
            Save this report
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center justify-center rounded-sm border border-rule-strong bg-surface px-4 text-sm font-medium transition-colors hover:border-ink"
          >
            See plans
          </Link>
        </div>
        <p className="mt-3 font-mono text-[11px] text-slate">
          {result.scansRemainingThisHour} free scan
          {result.scansRemainingThisHour === 1 ? '' : 's'} left this hour
        </p>
      </div>
    </div>
  );
}

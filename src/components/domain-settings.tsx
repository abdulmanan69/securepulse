'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Callout } from '@/components/primitives';
import type { Domain, ScanFrequency } from '@/lib/db/schema';

interface VerifyResponse {
  verified: boolean;
  expected?: string;
  checkedNames?: string[];
  foundRecords?: string[];
  hint?: string;
}

export function DomainSettings({
  domain,
  expectedRecord,
  allowedFrequencies,
  alertsAvailable,
}: {
  domain: Domain;
  expectedRecord: string;
  allowedFrequencies: ScanFrequency[];
  alertsAvailable: boolean;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function verify() {
    setChecking(true);
    setError(null);
    const response = await fetch(`/api/domains/${domain.id}/verify`, {
      method: 'POST',
    });
    const data = await response.json();
    setChecking(false);

    if (!response.ok) {
      setError(data.error ?? 'Verification could not run.');
      return;
    }
    setVerifyResult(data);
    if (data.verified) router.refresh();
  }

  async function update(patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/domains/${domain.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(data.error ?? 'That change could not be saved.');
      return;
    }
    router.refresh();
  }

  async function remove() {
    setDeleting(true);
    const response = await fetch(`/api/domains/${domain.id}`, { method: 'DELETE' });
    if (!response.ok) {
      setDeleting(false);
      setError('That site could not be removed.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <Callout tone="alert">{error}</Callout> : null}

      <section className="border border-rule bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[17px] font-bold">Ownership</h2>
          <span
            className={`font-mono text-[11px] uppercase tracking-[0.14em] ${domain.verifiedAt ? 'text-pass' : 'text-caution'}`}
          >
            {domain.verifiedAt ? 'Verified' : 'Not verified'}
          </span>
        </div>

        {domain.verifiedAt ? (
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-slate">
            You proved control of this domain on{' '}
            {new Date(domain.verifiedAt).toLocaleDateString('en-US', {
              dateStyle: 'medium',
            })}
            . Scans include checks for accidentally published files such as
            .env and .git.
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-slate">
              Add this TXT record to your DNS to unlock checks for accidentally
              published files. We only request paths beyond the homepage on
              domains you have proven you control.
            </p>

            <dl className="mt-4 space-y-2 border border-rule bg-paper p-4">
              <div className="flex flex-wrap gap-x-3 text-[13px]">
                <dt className="w-16 shrink-0 font-mono text-[11px] uppercase tracking-wide text-slate">
                  Type
                </dt>
                <dd className="font-mono">TXT</dd>
              </div>
              <div className="flex flex-wrap gap-x-3 text-[13px]">
                <dt className="w-16 shrink-0 font-mono text-[11px] uppercase tracking-wide text-slate">
                  Name
                </dt>
                <dd className="font-mono break-all">
                  {domain.hostname}
                  <span className="text-slate"> or </span>
                  _securepulse.{domain.hostname}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-3 text-[13px]">
                <dt className="w-16 shrink-0 font-mono text-[11px] uppercase tracking-wide text-slate">
                  Value
                </dt>
                <dd className="font-mono break-all">{expectedRecord}</dd>
              </div>
            </dl>

            <div className="mt-4 flex items-center gap-3">
              <Button onClick={verify} disabled={checking} size="sm">
                {checking ? 'Checking DNS…' : 'Check for the record'}
              </Button>
              {verifyResult && !verifyResult.verified ? (
                <span className="text-[13px] text-caution">
                  Not found yet. {verifyResult.hint}
                </span>
              ) : null}
            </div>
          </>
        )}
      </section>

      <section className="border border-rule bg-surface p-5">
        <h2 className="font-display text-[17px] font-bold">Schedule</h2>
        <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-slate">
          How often we re-check this site without being asked. This is the part
          that catches a change you did not know about.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(['manual', 'weekly', 'daily'] as ScanFrequency[]).map((frequency) => {
            const allowed = allowedFrequencies.includes(frequency);
            const active = domain.scanFrequency === frequency;
            return (
              <button
                key={frequency}
                type="button"
                disabled={!allowed || saving}
                onClick={() => update({ scanFrequency: frequency })}
                className={`h-9 rounded-sm border px-4 text-[13px] font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? 'border-signal bg-signal text-white'
                    : 'border-rule-strong bg-surface hover:border-ink'
                }`}
              >
                {frequency === 'manual' ? 'On demand' : frequency}
              </button>
            );
          })}
        </div>

        {allowedFrequencies.length === 1 ? (
          <p className="mt-3 text-[13px] text-caution">
            Automatic scans are part of the Pro plan.
          </p>
        ) : null}

        <label className="mt-5 flex items-start gap-3">
          <input
            type="checkbox"
            checked={domain.alertsEnabled}
            disabled={!alertsAvailable || saving}
            onChange={(event) => update({ alertsEnabled: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-signal disabled:opacity-50"
          />
          <span className="text-[14px]">
            Email me when the grade drops
            <span className="mt-0.5 block text-[13px] text-slate">
              {alertsAvailable
                ? 'Also warns you 21 days before the certificate expires.'
                : 'Email alerts are part of the Pro plan.'}
            </span>
          </span>
        </label>
      </section>

      <section className="border border-alert/25 bg-surface p-5">
        <h2 className="font-display text-[17px] font-bold">Remove this site</h2>
        <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-slate">
          Deletes the domain and its entire scan history. This cannot be undone,
          and it frees the slot for another site.
        </p>

        {confirmDelete ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="danger" size="sm" onClick={remove} disabled={deleting}>
              {deleting ? 'Removing…' : `Yes, delete ${domain.hostname}`}
            </Button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-[13px] text-slate hover:text-ink"
            >
              Keep it
            </button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setConfirmDelete(true)}
          >
            Remove site
          </Button>
        )}
      </section>
    </div>
  );
}

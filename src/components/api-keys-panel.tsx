'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

import { IconCheck, IconCopy } from '@/components/icons';
import { Button, Callout, inputClass } from '@/components/primitives';
import { useToast } from '@/components/toast';

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Keys are rendered from server-fetched data, so the panel has no loading
 * flash and no fetch-on-mount effect. It only re-reads after a mutation it
 * performed itself.
 */
export function ApiKeysPanel({
  enabled,
  initialKeys,
}: {
  enabled: boolean;
  initialKeys: KeyRow[];
}) {
  const { push } = useToast();
  const [keys, setKeys] = useState<KeyRow[]>(initialKeys);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/account/api-keys');
    if (response.ok) {
      const data = await response.json();
      setKeys(data.keys ?? []);
    }
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);

    const response = await fetch('/api/account/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    setCreating(false);

    if (!response.ok) {
      setError(data.error ?? 'That key could not be created.');
      return;
    }

    setFreshKey(data.key);
    setName('');
    void load();
  }

  async function revoke(id: string) {
    const response = await fetch(`/api/account/api-keys/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      push({ tone: 'error', title: 'Could not revoke that key' });
      return;
    }
    push({ tone: 'success', title: 'Key revoked', body: 'It stops working immediately.' });
    void load();
  }

  if (!enabled) {
    return (
      <div className="border border-rule bg-surface p-5">
        <p className="text-[13.5px] leading-relaxed text-slate">
          Read-only API access is part of the Agency plan. It exposes your
          sites, scan history and full findings so you can pull them into your
          own dashboards or client reporting.
        </p>
        <Link
          href="/dashboard/billing"
          className="mt-3 inline-block text-[13px] font-medium text-signal hover:underline"
        >
          See the Agency plan →
        </Link>
      </div>
    );
  }

  const active = keys.filter((key) => !key.revokedAt);

  return (
    <div className="border border-rule bg-surface p-5">
      {freshKey ? (
        <div className="mb-5 border border-signal/30 bg-signal-soft p-4">
          <p className="text-[13.5px] font-semibold text-signal-ink">
            Copy this key now
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-signal-ink">
            This is the only time it is shown. We store a hash, not the key, so
            we cannot show it to you again.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto border border-rule bg-surface px-2.5 py-2 font-mono text-[12px] whitespace-nowrap">
              {freshKey}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(freshKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  // Shown on screen regardless.
                }
              }}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm border border-rule-strong bg-surface px-3 text-[12.5px] hover:border-ink"
            >
              {copied ? <IconCheck /> : <IconCopy />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFreshKey(null)}
            className="mt-3 text-[12.5px] font-medium text-signal-ink underline"
          >
            I have saved it
          </button>
        </div>
      ) : null}

      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="key-name" className="sr-only">
          Key name
        </label>
        <input
          id="key-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="What is this key for? e.g. Client dashboard"
          maxLength={60}
          className={inputClass}
        />
        <Button
          type="submit"
          disabled={creating || name.trim().length === 0}
          className="shrink-0 whitespace-nowrap sm:w-36"
        >
          {creating ? 'Creating…' : 'Create key'}
        </Button>
      </form>

      {error ? (
        <div className="mt-3">
          <Callout tone="alert">{error}</Callout>
        </div>
      ) : null}

      <div className="mt-5">
        {keys.length === 0 ? (
          <p className="text-[13px] text-slate">
            No keys yet. Create one to start pulling your data.
          </p>
        ) : (
          <ul className="divide-y divide-rule border border-rule">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">
                    {key.name}
                    {key.revokedAt ? (
                      <span className="ml-2 font-mono text-[10.5px] text-alert uppercase">
                        revoked
                      </span>
                    ) : null}
                  </p>
                  <p className="font-mono text-[11px] text-slate">
                    {key.prefix}…{' · '}
                    {key.lastUsedAt
                      ? `last used ${new Date(key.lastUsedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}`
                      : 'never used'}
                  </p>
                </div>
                {!key.revokedAt ? (
                  <Button variant="outline" size="sm" onClick={() => revoke(key.id)}>
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t border-rule pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
          Using it
        </p>
        <pre className="mt-2 overflow-x-auto border border-rule bg-paper p-3 font-mono text-[11.5px] leading-relaxed">
{`curl -H "Authorization: Bearer sp_..." \
  https://your-domain/api/v1/sites

GET /api/v1/sites            your monitored sites
GET /api/v1/scans?site=<id>  scan history
GET /api/v1/scans/<id>       one scan with full findings`}
        </pre>
        <p className="mt-2 text-[12.5px] text-slate">
          Read-only, 120 requests per minute per key. Revoking takes effect
          immediately. Keys stop working if the plan no longer includes API
          access.
        </p>
      </div>

      {active.length > 0 ? (
        <p className="mt-3 font-mono text-[11px] text-slate">
          {active.length} active key{active.length === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  IconActivity,
  IconCard,
  IconGauge,
  IconPlus,
  IconReport,
  IconSearch,
  IconSettings,
  IconShield,
  IconSites,
} from '@/components/icons';

/**
 * Command palette.
 *
 * Opens from the search field or Cmd/Ctrl-K. One surface covering the three
 * things people do repeatedly - jump to a site, scan a site, reach a page - so
 * none of them requires navigating somewhere else to find the control first.
 */

interface DomainRow {
  id: string;
  hostname: string;
  lastGrade: string | null;
  verifiedAt: string | null;
}

type Action = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  Icon: (props: { size?: number }) => React.ReactElement;
  run: () => void | Promise<void>;
};

const PAGES = [
  { href: '/dashboard', label: 'Overview', Icon: IconGauge },
  { href: '/dashboard/sites', label: 'Sites', Icon: IconSites },
  { href: '/dashboard/reports', label: 'Reports', Icon: IconReport },
  { href: '/dashboard/activity', label: 'Activity', Icon: IconActivity },
  { href: '/dashboard/billing', label: 'Plan & billing', Icon: IconCard },
  { href: '/dashboard/settings', label: 'Settings', Icon: IconSettings },
];

export function QuickScan() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Opening resets the palette and refreshes the site list. Done here rather
   * than in an effect keyed on `open`: setting state inside an effect triggers
   * a second render pass for something we already know at the moment of the
   * click.
   */
  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery('');
    setCursor(0);
    fetch('/api/domains')
      .then((response) => (response.ok ? response.json() : { domains: [] }))
      .then((data) => setDomains(data.domains ?? []))
      .catch(() => setDomains([]));
  }, []);

  // Cmd/Ctrl-K from anywhere in the app.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => {
          if (value) return false;
          openPalette();
          return true;
        });
      }
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette]);

  const runScan = useCallback(
    async (domainId: string) => {
      setBusy(domainId);
      const response = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domainId }),
      });
      const data = await response.json();
      setBusy(null);
      setOpen(false);
      if (response.ok) router.push(`/dashboard/scans/${data.scanId}`);
      else router.refresh();
    },
    [router],
  );

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];

    for (const domain of domains) {
      list.push({
        id: `open-${domain.id}`,
        label: domain.hostname,
        hint: domain.lastGrade ? `Grade ${domain.lastGrade}` : 'Never scanned',
        group: 'Sites',
        Icon: IconSites,
        run: () => {
          setOpen(false);
          router.push(`/dashboard/sites/${domain.id}`);
        },
      });
      list.push({
        id: `scan-${domain.id}`,
        label: `Scan ${domain.hostname}`,
        hint: 'Runs now',
        group: 'Actions',
        Icon: IconShield,
        run: () => runScan(domain.id),
      });
    }

    list.push({
      id: 'add-site',
      label: 'Add a site',
      group: 'Actions',
      Icon: IconPlus,
      run: () => {
        setOpen(false);
        router.push('/dashboard/sites?add=1');
      },
    });

    for (const page of PAGES) {
      list.push({
        id: `go-${page.href}`,
        label: page.label,
        group: 'Go to',
        Icon: page.Icon,
        run: () => {
          setOpen(false);
          router.push(page.href);
        },
      });
    }

    return list;
  }, [domains, router, runScan]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return actions;
    return actions.filter((action) =>
      `${action.label} ${action.group}`.toLowerCase().includes(term),
    );
  }, [actions, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Action[]>();
    for (const action of filtered) {
      map.set(action.group, [...(map.get(action.group) ?? []), action]);
    }
    return [...map.entries()];
  }, [filtered]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((value) => Math.min(value + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((value) => Math.max(value - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void filtered[cursor]?.run();
    }
  }

  let index = -1;

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-sm border border-rule-strong bg-surface px-3 text-[13px] text-slate transition-colors hover:border-ink"
      >
        <IconSearch />
        <span>Search or run a scan</span>
        <kbd className="ml-auto hidden rounded-sm border border-rule px-1.5 font-mono text-[10px] sm:block">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[var(--shade)]"
          />
          <div
            role="dialog"
            aria-label="Command palette"
            className="relative w-full max-w-xl overflow-hidden border border-rule bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-2.5 border-b border-rule px-4">
              <IconSearch />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  // Highlight the first result of the new list, not whatever
                  // index happened to be selected for the old one.
                  setCursor(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search sites, run a scan, jump to a page…"
                className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-muted"
              />
            </div>

            <div className="max-h-[52vh] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-slate">
                  Nothing matches that.
                </p>
              ) : (
                grouped.map(([group, items]) => (
                  <div key={group} className="mb-1">
                    <p className="px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-slate">
                      {group}
                    </p>
                    {items.map((action) => {
                      index += 1;
                      const currentIndex = index;
                      const active = currentIndex === cursor;
                      const scanning = busy !== null && action.id === `scan-${busy}`;
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onMouseEnter={() => setCursor(currentIndex)}
                          onClick={() => void action.run()}
                          className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13.5px] ${
                            active ? 'bg-signal-soft text-signal-ink' : 'text-ink'
                          }`}
                        >
                          <action.Icon />
                          <span className="truncate">{action.label}</span>
                          {action.hint ? (
                            <span className="ml-auto shrink-0 font-mono text-[11px] text-slate">
                              {scanning ? 'Scanning…' : action.hint}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-rule bg-paper px-4 py-2 font-mono text-[10.5px] text-slate">
              <span>↑↓ move</span>
              <span>↵ select</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { IconChevron } from '@/components/icons';
import { Button } from '@/components/primitives';
import { useToast } from '@/components/toast';

/** Download menu for one scan. */
export function ExportMenu({ scanId }: { scanId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-rule-strong bg-surface px-3.5 text-[13px] font-medium transition-colors hover:border-ink"
      >
        Export
        <span className={open ? 'rotate-90 transition-transform' : 'transition-transform'}>
          <IconChevron size={14} />
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-56 border border-rule bg-surface shadow-lg"
          >
            <a
              role="menuitem"
              href={`/api/scans/${scanId}/export?format=csv`}
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2.5 text-[13px] transition-colors hover:bg-paper"
            >
              Download CSV
              <span className="mt-0.5 block text-[11.5px] text-slate">
                One row per finding, for a spreadsheet
              </span>
            </a>
            <a
              role="menuitem"
              href={`/api/scans/${scanId}/export?format=json`}
              onClick={() => setOpen(false)}
              className="block border-t border-rule px-3.5 py-2.5 text-[13px] transition-colors hover:bg-paper"
            >
              Download JSON
              <span className="mt-0.5 block text-[11.5px] text-slate">
                Full detail including evidence
              </span>
            </a>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Scans every site in the account, reporting what it managed to do. */
export function BulkScanButton({ siteCount }: { siteCount: number }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    const response = await fetch('/api/scans/bulk', { method: 'POST' });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      push({
        tone: 'error',
        title: 'Bulk scan could not run',
        body: data.error ?? 'Try scanning sites individually.',
      });
      return;
    }

    push({
      tone: data.failed > 0 ? 'info' : 'success',
      title: `Scanned ${data.scanned} site${data.scanned === 1 ? '' : 's'}`,
      body: [
        data.failed > 0 ? `${data.failed} failed` : null,
        data.skipped > 0 ? `${data.skipped} skipped: out of quota` : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'All reports are up to date.',
    });

    router.refresh();
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={run}
      disabled={pending || siteCount === 0}
      title={siteCount === 0 ? 'Add a site first' : undefined}
    >
      {pending ? `Scanning ${siteCount}…` : 'Scan all'}
    </Button>
  );
}

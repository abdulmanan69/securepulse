'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Error boundary for the dashboard.
 *
 * Says what to do next rather than apologising. `digest` is included because
 * it is the only thing that links what the reader saw to what our logs
 * recorded - the message itself is deliberately not exposed.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard] render failed', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg pt-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-alert">
        Something broke
      </p>
      <h1 className="font-display mt-2 text-2xl font-extrabold">
        This page could not be loaded
      </h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-slate">
        The error has been logged. Your sites and scan history are unaffected.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-sm bg-signal px-4 text-sm font-medium text-white transition-colors hover:bg-signal-hover"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-sm border border-rule-strong bg-surface px-4 text-sm font-medium transition-colors hover:border-ink"
        >
          Back to overview
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-6 font-mono text-[11px] text-slate">
          Reference: {error.digest}
        </p>
      ) : null}
    </div>
  );
}

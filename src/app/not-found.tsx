import Link from 'next/link';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-5 py-20">
        <div className="max-w-md text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate">
            404
          </p>
          <h1 className="font-display mt-2 text-3xl font-extrabold">
            That page does not exist
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate">
            The link may be out of date, or the report may belong to a different
            account.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/"
              className="inline-flex h-10 items-center rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-ink-hover"
            >
              Scan a site
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-sm border border-rule-strong bg-surface px-4 text-sm font-medium transition-colors hover:border-ink"
            >
              Go to dashboard
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

import Link from 'next/link';

/**
 * Not-found inside the dashboard.
 *
 * Without this, a missing site or scan falls through to the marketing 404,
 * which drops the signed-in person out of the app entirely. Here they keep
 * the sidebar and one click back.
 *
 * Note: Next.js streams the layout before the page runs, so the HTTP status
 * on a nested notFound() is 200 even though this is the page rendered. That
 * is a framework limitation, not a deliberate soft-404. It only affects
 * crawlers, and everything under /dashboard requires a session anyway.
 */
export default function DashboardNotFound() {
  return (
    <div className="mx-auto max-w-lg pt-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate">
        Not found
      </p>
      <h1 className="font-display mt-2 text-2xl font-extrabold">
        That does not exist on this account
      </h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-slate">
        The site or report may have been deleted, or the link may belong to a
        different account. We do not say which, because that would tell anyone
        with a guessed link whether it exists.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/dashboard/sites"
          className="inline-flex h-10 items-center rounded-sm bg-signal px-4 text-sm font-medium text-white transition-colors hover:bg-signal-hover"
        >
          Your sites
        </Link>
        <Link
          href="/dashboard/reports"
          className="inline-flex h-10 items-center rounded-sm border border-rule-strong bg-surface px-4 text-sm font-medium transition-colors hover:border-ink"
        >
          All reports
        </Link>
      </div>
    </div>
  );
}

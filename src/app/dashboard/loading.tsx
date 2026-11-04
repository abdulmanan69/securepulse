/**
 * Route-level loading state.
 *
 * Skeletons shaped like the content that is coming, not a spinner: the page
 * does not jump when the data lands, and the reader can already see how much
 * is on its way.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-48 rounded-sm bg-rule" />
      <div className="mt-2 h-4 w-72 rounded-sm bg-rule/60" />

      <div className="mt-6 grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="bg-surface p-4">
            <div className="h-2.5 w-24 rounded-sm bg-rule" />
            <div className="mt-3 h-8 w-16 rounded-sm bg-rule" />
            <div className="mt-2 h-2.5 w-28 rounded-sm bg-rule/60" />
          </div>
        ))}
      </div>

      <div className="mt-8 h-5 w-40 rounded-sm bg-rule" />
      <div className="mt-3 divide-y divide-rule border border-rule bg-surface">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-3 p-4">
            <div className="h-8 w-8 shrink-0 rounded-sm bg-rule" />
            <div className="min-w-0 flex-1">
              <div className="h-3.5 w-48 rounded-sm bg-rule" />
              <div className="mt-2 h-2.5 w-32 rounded-sm bg-rule/60" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}

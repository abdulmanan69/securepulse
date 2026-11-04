import Link from 'next/link';

import { ThemeToggle } from '@/components/theme-toggle';

export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="border-b border-rule bg-paper/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="block h-5 w-5 border-2 border-signal"
            style={{
              // A square with one corner open: the gap is the point.
              clipPath: 'polygon(0 0, 100% 0, 100% 45%, 55% 45%, 55% 100%, 0 100%)',
            }}
          />
          <span className="font-display text-[17px] font-bold tracking-tight">
            SecurePulse
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/pricing"
            className="rounded-sm px-3 py-2 text-slate transition-colors hover:text-ink"
          >
            Pricing
          </Link>
          <Link
            href="/what-we-check"
            className="hidden rounded-sm px-3 py-2 text-slate transition-colors hover:text-ink sm:block"
          >
            What we check
          </Link>
          {signedIn ? (
            <Link
              href="/dashboard"
              className="ml-1 inline-flex h-9 items-center rounded-sm bg-ink px-4 font-medium text-paper transition-colors hover:bg-ink-hover"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-sm px-3 py-2 text-slate transition-colors hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="ml-1 inline-flex h-9 items-center rounded-sm bg-ink px-4 font-medium text-paper transition-colors hover:bg-ink-hover"
              >
                Start free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="font-display text-[15px] font-bold">SecurePulse</p>
            <p className="mt-2 max-w-[32ch] text-[13px] leading-relaxed text-slate">
              Continuous website security monitoring for the people who look
              after other people&rsquo;s websites.
            </p>
          </div>

          <nav className="text-[13px]">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate">
              Product
            </p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/pricing" className="text-slate hover:text-ink">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/what-we-check" className="text-slate hover:text-ink">
                  What we check
                </Link>
              </li>
              <li>
                <Link href="/scanning-policy" className="text-slate hover:text-ink">
                  Scanning policy
                </Link>
              </li>
            </ul>
          </nav>

          <div className="text-[13px]">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate">
              Scope
            </p>
            <p className="mt-3 max-w-[34ch] leading-relaxed text-slate">
              SecurePulse performs passive configuration review only. It reads
              what a server already serves to any browser. It never exploits,
              fuzzes, brute-forces or port-scans anything.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
          <p className="font-mono text-[11px] text-slate">
            © {new Date().getFullYear()} SecurePulse
          </p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}

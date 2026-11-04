import { redirect } from 'next/navigation';

import { LogoutButton } from '@/components/logout-button';
import { MobileNav, SidebarContent } from '@/components/shell/sidebar';
import { QuickScan } from '@/components/shell/quick-scan';
import { ShortcutHelp } from '@/components/shell/shortcuts';
import { ThemeToggle } from '@/components/theme-toggle';
import { ToastProvider } from '@/components/toast';
import { getAuth } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import { getUsage } from '@/lib/billing/usage';

export const runtime = 'nodejs';

export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  // Single auth gate for everything under /dashboard. Pages still scope their
  // own queries by user id; this only decides who gets a page at all.
  const auth = await getAuth();
  if (!auth) redirect('/login');

  const plan = planFor(auth.plan);
  const usage = await getUsage(auth.user.id, auth.plan, auth.subscription);

  return (
    <ToastProvider>
      <ShortcutHelp />
      <div className="flex min-h-full flex-1">
      <aside className="hidden w-[13.5rem] shrink-0 border-r border-rule bg-surface lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent
            planName={plan.name}
            email={auth.user.email}
            footer={<LogoutButton />}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <MobileNav
              planName={plan.name}
              email={auth.user.email}
              footer={<LogoutButton />}
            />

            <QuickScan />

            <div className="ml-auto flex items-center gap-4">
              <div className="hidden md:block">
                <ThemeToggle />
              </div>
              <dl className="hidden items-center gap-4 sm:flex">
                <div className="flex items-baseline gap-1.5">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
                    Sites
                  </dt>
                  <dd className="font-mono text-[12px] tabular-nums">
                    {usage.domainsUsed}
                    <span className="text-slate">/{usage.domainsLimit}</span>
                  </dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
                    Scans
                  </dt>
                  <dd className="font-mono text-[12px] tabular-nums">
                    {usage.scansUsed}
                    <span className="text-slate">/{usage.scansLimit}</span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

        <footer className="border-t border-rule px-4 py-4 sm:px-6">
          <p className="font-mono text-[10.5px] text-slate">
            Passive configuration review only. Nothing is exploited, fuzzed or
            port-scanned.
          </p>
        </footer>
      </div>
      </div>
    </ToastProvider>
  );
}

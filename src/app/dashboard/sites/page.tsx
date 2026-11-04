import { Suspense } from 'react';

import { SitesTable } from '@/components/sites-table';
import { getAuth } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import { getUsage } from '@/lib/billing/usage';
import { getPortfolioSummary } from '@/lib/portfolio';

export const runtime = 'nodejs';
export const metadata = { title: 'Sites' };

export default async function SitesPage() {
  const auth = await getAuth();
  if (!auth) return null;

  const [{ domains }, usage] = await Promise.all([
    getPortfolioSummary(auth.user.id),
    getUsage(auth.user.id, auth.plan, auth.subscription),
  ]);

  const plan = planFor(auth.plan);
  const canAddMore = usage.domainsUsed < usage.domainsLimit;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold">Sites</h1>
        <p className="mt-0.5 text-[13.5px] text-slate">
          {usage.domainsUsed} of {usage.domainsLimit} on the {plan.name} plan ·{' '}
          {usage.scansRemaining} scan{usage.scansRemaining === 1 ? '' : 's'} left
          this period
        </p>
      </div>

      <Suspense>
        <SitesTable
          domains={domains}
          canAddMore={canAddMore}
          limitMessage={
            canAddMore
              ? `Your ${plan.name} plan covers ${usage.domainsLimit} domain${usage.domainsLimit === 1 ? '' : 's'}.`
              : `All ${usage.domainsLimit} slot${usage.domainsLimit === 1 ? '' : 's'} on the ${plan.name} plan are in use. Upgrade to monitor more.`
          }
        />
      </Suspense>
    </div>
  );
}

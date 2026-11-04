import { CheckoutButton, PortalButton } from '@/components/billing-actions';
import { Callout } from '@/components/primitives';
import { getAuth } from '@/lib/auth/session';
import { PLANS, planFor } from '@/lib/billing/plans';
import { billingStatus } from '@/lib/billing/stripe';
import { getUsage } from '@/lib/billing/usage';

export const runtime = 'nodejs';
export const metadata = { title: 'Plan and billing' };

export default async function BillingPage({
  searchParams,
}: PageProps<'/dashboard/billing'>) {
  const auth = await getAuth();
  if (!auth) return null;

  const params = await searchParams;
  const usage = await getUsage(auth.user.id, auth.plan, auth.subscription);
  const current = planFor(auth.plan);
  const billing = billingStatus();

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-3xl font-extrabold">Plan and billing</h1>

      {params.checkout === 'success' ? (
        <div className="mt-6">
          <Callout tone="pass" title="Checkout complete">
            Your subscription is being confirmed by Stripe. If the plan below
            still shows the old one, refresh in a few seconds.
          </Callout>
        </div>
      ) : null}

      {/* The product never implies live payments are being taken when they
          are not. This states the actual state of the deployment. */}
      {billing.mode !== 'live' ? (
        <div className="mt-6">
          <Callout
            tone={billing.mode === 'test' ? 'caution' : 'neutral'}
            title={
              billing.mode === 'test'
                ? 'Stripe is in test mode'
                : 'Billing is not connected'
            }
          >
            {billing.message}
          </Callout>
        </div>
      ) : null}

      <section className="mt-6 border border-rule bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
              Current plan
            </p>
            <p className="font-display mt-1 text-2xl font-extrabold">
              {current.name}
            </p>
            {auth.subscription?.status &&
            auth.subscription.status !== 'active' ? (
              <p className="mt-1 text-[13px] text-caution">
                Subscription status: {auth.subscription.status.replace('_', ' ')}
              </p>
            ) : null}
            {auth.subscription?.currentPeriodEnd ? (
              <p className="mt-1 text-[13px] text-slate">
                {auth.subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on{' '}
                {new Date(
                  auth.subscription.currentPeriodEnd,
                ).toLocaleDateString('en-US', { dateStyle: 'medium' })}
              </p>
            ) : null}
          </div>

          {auth.subscription?.stripeCustomerId ? <PortalButton /> : null}
        </div>

        <dl className="mt-6 grid gap-4 border-t border-rule pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-[13px] text-slate">Domains</dt>
            <dd className="font-display text-xl font-bold tabular-nums">
              {usage.domainsUsed}
              <span className="text-slate">/{usage.domainsLimit}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-slate">Scans this period</dt>
            <dd className="font-display text-xl font-bold tabular-nums">
              {usage.scansUsed}
              <span className="text-slate">/{usage.scansLimit}</span>
            </dd>
          </div>
        </dl>
      </section>

      <h2 className="font-display mt-10 text-xl font-bold">
        {auth.plan === 'agency' ? 'Your plan' : 'Change plan'}
      </h2>

      <div className="mt-4 grid gap-px border border-rule bg-rule md:grid-cols-3">
        {Object.values(PLANS).map((plan) => {
          const isCurrent = plan.id === auth.plan;
          return (
            <div key={plan.id} className="flex flex-col bg-surface p-5">
              <div className="flex items-baseline justify-between">
                <p className="font-display text-[17px] font-bold">{plan.name}</p>
                {isCurrent ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">
                    Current
                  </span>
                ) : null}
              </div>
              <p className="font-display mt-1 text-3xl font-extrabold">
                {plan.priceCents === 0 ? 'Free' : `$${plan.priceCents / 100}`}
                {plan.priceCents > 0 ? (
                  <span className="font-sans text-sm font-normal text-slate">
                    /mo
                  </span>
                ) : null}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="text-[13px] text-slate">
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <p className="text-center text-[13px] text-slate">
                    This is your plan
                  </p>
                ) : plan.id === 'free' ? (
                  <p className="text-center text-[13px] text-slate">
                    Cancel in the billing portal to return to Free
                  </p>
                ) : (
                  <CheckoutButton
                    plan={plan.id}
                    label={`Switch to ${plan.name}`}
                    disabled={!billing.configured}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

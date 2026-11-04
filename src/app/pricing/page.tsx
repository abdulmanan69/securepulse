import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getAuth } from '@/lib/auth/session';
import { PLANS } from '@/lib/billing/plans';

export const runtime = 'nodejs';
export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Free for one site. $19/month to monitor five sites daily with email alerts. $49/month for agencies, with white-label reports for 25 client sites.',
};

const FAQ = [
  {
    q: 'What happens when I run out of scans?',
    a: 'Scheduled scans pause until the period resets, and the dashboard tells you before you get there. Nothing is deleted and nothing is charged automatically.',
  },
  {
    q: 'Do I need to verify a domain?',
    a: 'Only to unlock checks for accidentally published files such as .env and .git. Those require requesting paths beyond the homepage, so we do it only on domains you have proven you control with a DNS record. Every other check runs without verification.',
  },
  {
    q: 'Is this a penetration test?',
    a: 'No, and we will not let the report imply it is. SecurePulse is a passive configuration review: it reads what your server already sends to any browser. It does not attempt to exploit anything, and it cannot tell you your application code is free of vulnerabilities.',
  },
  {
    q: 'Can I cancel?',
    a: 'Any time, from the billing portal. Your plan stays active until the end of the period you have paid for, then drops to Free.',
  },
];

export default async function PricingPage() {
  const auth = await getAuth();

  return (
    <>
      <SiteHeader signedIn={!!auth} />
      <main className="flex-1">
        <section className="border-b border-rule">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h1 className="font-display text-[2.5rem] leading-tight font-extrabold">
              Pricing
            </h1>
            <p className="mt-3 max-w-[56ch] text-[17px] leading-relaxed text-slate">
              Every plan runs the same twelve checks and produces the same
              report. What you pay for is how many sites you watch, how often
              they are re-checked, and whether the report carries your name.
            </p>

            <div className="mt-10 grid gap-px border border-rule bg-rule md:grid-cols-3">
              {Object.values(PLANS).map((plan) => (
                <div key={plan.id} className="flex flex-col bg-surface p-6">
                  <p className="font-display text-lg font-bold">{plan.name}</p>
                  <p className="font-display mt-2 text-5xl font-extrabold">
                    {plan.priceCents === 0 ? 'Free' : `$${plan.priceCents / 100}`}
                    {plan.priceCents > 0 ? (
                      <span className="font-sans text-base font-normal text-slate">
                        /month
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-3 min-h-[3.5rem] text-[14px] leading-relaxed text-slate">
                    {plan.tagline}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5 border-t border-rule pt-5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5 text-[14px]">
                        <span aria-hidden="true" className="text-pass">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={plan.id === 'free' ? '/signup' : `/signup?plan=${plan.id}`}
                    className={`mt-6 inline-flex h-11 items-center justify-center rounded-sm text-sm font-medium transition-colors ${
                      plan.id === 'pro'
                        ? 'bg-signal text-white hover:bg-signal-hover'
                        : 'border border-rule-strong hover:border-ink'
                    }`}
                  >
                    {plan.id === 'free' ? 'Start free' : `Start ${plan.name}`}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-surface">
          <div className="mx-auto max-w-3xl px-5 py-14">
            <h2 className="font-display text-2xl font-bold">
              Questions worth answering honestly
            </h2>
            <dl className="mt-6 divide-y divide-rule border-y border-rule">
              {FAQ.map((item) => (
                <div key={item.q} className="py-5">
                  <dt className="text-[15px] font-semibold">{item.q}</dt>
                  <dd className="mt-2 max-w-[66ch] text-[14px] leading-relaxed text-slate">
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

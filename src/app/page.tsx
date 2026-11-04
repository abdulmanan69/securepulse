import Link from 'next/link';

import { PublicScan } from '@/components/public-scan';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { PLANS } from '@/lib/billing/plans';
import { getAuth } from '@/lib/auth/session';

export const runtime = 'nodejs';

/** The twelve checks, grouped the way the report groups them. */
const CHECK_GROUPS = [
  {
    title: 'Encryption & certificates',
    weight: 25,
    items: [
      'HTTPS is reachable and plain HTTP redirects to it',
      'Certificate is trusted, and how many days until it expires',
      'TLS version is current, not a deprecated one',
    ],
  },
  {
    title: 'Security headers',
    weight: 34,
    items: [
      'HSTS, with a max-age long enough to matter',
      'Content-Security-Policy, graded on whether it would stop anything',
      'Clickjacking, cookie and MIME-sniffing controls',
    ],
  },
  {
    title: 'Email & DNS',
    weight: 15,
    items: [
      'SPF, and whether it actually restricts senders',
      'DMARC, and whether the policy enforces or only watches',
      'CAA, restricting who can issue certificates for the domain',
    ],
  },
  {
    title: 'Content & disclosure',
    weight: 26,
    items: [
      'Scripts or images loaded over plain HTTP on an HTTPS page',
      'Front-end libraries pinned to a version with known advisories',
      'Server headers publishing an exact software version',
    ],
  },
];

const RHYTHM = [
  {
    step: 'Every day',
    body: 'We re-run the full check set against each site you are monitoring.',
  },
  {
    step: 'The moment it drops',
    body: 'You get an email naming what changed and what to put back.',
  },
  {
    step: 'When the client asks',
    body: 'You hand them a dated report with your name on it, not ours.',
  },
];

export default async function HomePage() {
  const auth = await getAuth();

  return (
    <>
      <SiteHeader signedIn={!!auth} />

      <main className="flex-1">
        <section className="ruled border-b border-rule">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
            <PublicScan />
          </div>
        </section>

        <section className="border-b border-rule bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-display max-w-[20ch] text-[2rem] leading-tight font-bold sm:text-[2.5rem]">
              A one-off audit is out of date in sixty days.
            </h2>
            <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-slate">
              Nothing about a website stays still. Someone ships a change and the
              security headers go with it. A certificate renewal fails quietly. A
              DNS record gets edited during a migration. None of it announces
              itself, and none of it surfaces until a customer, a browser warning,
              or an attacker finds it first.
            </p>

            <div className="mt-10 grid gap-px border border-rule bg-rule sm:grid-cols-3">
              {RHYTHM.map((item) => (
                <div key={item.step} className="bg-surface p-6">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal">
                    {item.step}
                  </p>
                  <p className="mt-3 text-[15px] leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-rule">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-[2rem] leading-tight font-bold">
                Twelve checks, weighted by what goes wrong
              </h2>
              <Link
                href="/what-we-check"
                className="text-sm font-medium text-signal hover:underline"
              >
                Full methodology →
              </Link>
            </div>

            <div className="mt-8 grid gap-px border border-rule bg-rule sm:grid-cols-2">
              {CHECK_GROUPS.map((group) => (
                <div key={group.title} className="bg-surface p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-[17px] font-bold">
                      {group.title}
                    </h3>
                    <span className="font-mono text-[11px] text-slate">
                      {group.weight} pts
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {group.items.map((item) => (
                      <li
                        key={item}
                        className="flex gap-2.5 text-[14px] leading-relaxed text-slate"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-2 block h-px w-3 shrink-0 bg-rule-strong"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-display text-[2rem] leading-tight font-bold">
              Straightforward pricing
            </h2>
            <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-slate">
              Every plan runs the same twelve checks. What changes is how many
              sites you watch, how often, and whether you can hand the report to
              a client.
            </p>

            <div className="mt-8 grid gap-px border border-rule bg-rule md:grid-cols-3">
              {Object.values(PLANS).map((plan) => (
                <div key={plan.id} className="flex flex-col bg-surface p-6">
                  <p className="font-display text-[17px] font-bold">{plan.name}</p>
                  <p className="font-display mt-2 text-4xl font-extrabold">
                    {plan.priceCents === 0 ? 'Free' : `$${plan.priceCents / 100}`}
                    {plan.priceCents > 0 ? (
                      <span className="font-sans text-sm font-normal text-slate">
                        /month
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-3 min-h-[3rem] text-[14px] leading-relaxed text-slate">
                    {plan.tagline}
                  </p>
                  <ul className="mt-4 flex-1 space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-[14px]">
                        <span aria-hidden="true" className="text-pass">
                          ✓
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={plan.id === 'free' ? '/signup' : `/signup?plan=${plan.id}`}
                    className={`mt-6 inline-flex h-10 items-center justify-center rounded-sm text-sm font-medium transition-colors ${
                      plan.id === 'pro'
                        ? 'bg-signal text-white hover:bg-signal-hover'
                        : 'border border-rule-strong hover:border-ink'
                    }`}
                  >
                    {plan.id === 'free'
                      ? 'Create free account'
                      : `Start ${plan.name}`}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getAuth } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const metadata: Metadata = {
  title: 'What we check',
  description:
    'The full twelve-check methodology, the point weighting behind the A to F grade, and what each finding actually means.',
};

const CHECKS = [
  {
    category: 'Encryption & certificates',
    total: 25,
    rows: [
      ['HTTPS and the HTTP upgrade', 8, 'Whether the site loads over HTTPS at all, and whether a visitor who types the bare domain is moved to it automatically.'],
      ['Certificate validity', 9, 'Whether browsers trust the certificate, and how many days remain before it expires. Partial credit inside 30 days, because a certificate about to lapse is not a clean pass.'],
      ['TLS version', 8, 'Whether the negotiated protocol is TLS 1.2 or 1.3, rather than a version with known weaknesses.'],
    ],
  },
  {
    category: 'Security headers',
    total: 34,
    rows: [
      ['Strict-Transport-Security', 8, 'Present, with a max-age long enough to matter and coverage of subdomains.'],
      ['Content-Security-Policy', 9, 'Graded on whether it would actually stop an injected script. A policy built on unsafe-inline with a wildcard source scores as weak, not as a pass.'],
      ['Clickjacking protection', 5, 'Either CSP frame-ancestors or X-Frame-Options.'],
      ['X-Content-Type-Options', 4, 'Stops the browser guessing a file type the server already declared.'],
      ['Referrer-Policy', 4, 'Limits the URLs handed to third-party sites your visitors click through to.'],
      ['Permissions-Policy', 4, 'Restricts camera, microphone and geolocation access.'],
    ],
  },
  {
    category: 'Cookies & disclosure',
    total: 14,
    rows: [
      ['Cookie attributes', 8, 'Secure, HttpOnly and a restrictive SameSite on every cookie set by the homepage.'],
      ['Version disclosure', 6, 'Whether response headers publish the exact software version, which lets an attacker select targets from a CVE announcement without testing anything.'],
    ],
  },
  {
    category: 'Page content',
    total: 9,
    rows: [
      ['Mixed content', 5, 'Scripts, styles, images or media loaded over plain HTTP on an HTTPS page. Active subresources fail; passive ones warn.'],
      ['Outdated front-end libraries', 4, 'Version-pinned copies of common libraries sitting below their minimum safe release.'],
    ],
  },
  {
    category: 'Email & DNS',
    total: 15,
    rows: [
      ['SPF', 5, 'Published, and ending in a way that actually restricts senders rather than authorising the whole internet.'],
      ['DMARC', 6, 'Published, and whether the policy enforces (reject or quarantine) or only monitors.'],
      ['CAA', 4, 'Restricts which certificate authorities may issue for the domain.'],
    ],
  },
  {
    category: 'Disclosure policy',
    total: 3,
    rows: [
      ['security.txt', 3, 'A published route for a researcher to report a vulnerability to you instead of guessing, giving up, or disclosing publicly.'],
    ],
  },
];

export default async function WhatWeCheckPage() {
  const auth = await getAuth();

  return (
    <>
      <SiteHeader signedIn={!!auth} />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <h1 className="font-display text-[2.25rem] leading-tight font-extrabold">
            What we check
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-slate">
            Twelve checks, weighted to 100 points. The weighting reflects
            consequence, not effort: a site nobody can reach securely loses far
            more than one missing a low-risk header.
          </p>

          <div className="mt-8 border border-rule bg-surface p-5">
            <h2 className="font-display text-[17px] font-bold">
              How the grade is calculated
            </h2>
            <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-slate">
              <li>
                <strong className="text-ink">The denominator is fixed at 100.</strong>{' '}
                Every check contributes its points whether it passed, failed, or
                could not be assessed. A site that does not respond scores zero
                rather than getting a smaller, easier total.
              </li>
              <li>
                <strong className="text-ink">Publicly exposed files apply a flat penalty.</strong>{' '}
                A readable .env deducts 30 points outright, because a site
                leaking its secrets must not be able to score a B on the
                strength of tidy headers elsewhere.
              </li>
              <li>
                <strong className="text-ink">Grades:</strong> A+ at 97 and above,
                A at 90, B at 80, C at 70, D at 60, F below that.
              </li>
            </ul>
          </div>

          {CHECKS.map((group) => (
            <section key={group.category} className="mt-10">
              <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
                <h2 className="font-display text-xl font-bold">
                  {group.category}
                </h2>
                <span className="font-mono text-[12px] text-slate">
                  {group.total} points
                </span>
              </div>
              <dl className="divide-y divide-rule">
                {group.rows.map(([name, weight, detail]) => (
                  <div key={String(name)} className="py-4">
                    <dt className="flex items-baseline justify-between gap-3">
                      <span className="text-[15px] font-semibold">{name}</span>
                      <span className="shrink-0 font-mono text-[12px] text-slate">
                        {weight} pts
                      </span>
                    </dt>
                    <dd className="mt-1.5 max-w-[68ch] text-[14px] leading-relaxed text-slate">
                      {detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <div className="mt-12 border border-rule bg-surface p-6">
            <h2 className="font-display text-[17px] font-bold">
              What this is not
            </h2>
            <p className="mt-2 max-w-[66ch] text-[14px] leading-relaxed text-slate">
              This is a configuration review, not a penetration test. It reads
              what your server tells any visitor. It does not test your
              application for injection flaws, review your code, or check who
              has access to your server.{' '}
              <Link href="/scanning-policy" className="font-medium text-signal hover:underline">
                Read the full scanning policy →
              </Link>
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

import type { Metadata } from 'next';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getAuth } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const metadata: Metadata = {
  title: 'Scanning policy',
  description:
    'Exactly what SecurePulse requests, what it will never do, and how domain ownership gates the deeper checks.',
};

export default async function ScanningPolicyPage() {
  const auth = await getAuth();

  return (
    <>
      <SiteHeader signedIn={!!auth} />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-5 py-14">
          <h1 className="font-display text-[2.25rem] leading-tight font-extrabold">
            Scanning policy
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-slate">
            SecurePulse is a passive configuration review. It reads what a
            server already serves to any browser or crawler. This page is the
            full, specific list, because a security tool that is vague about
            what it does is not one you should trust.
          </p>

          <section className="mt-10">
            <h2 className="font-display text-xl font-bold">What we request</h2>
            <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-slate">
              <li>A GET of the homepage over HTTPS, and over HTTP to test the upgrade.</li>
              <li>A TLS handshake on port 443, to read the certificate.</li>
              <li>Public DNS records: A, AAAA, MX, TXT, CAA, and _dmarc TXT.</li>
              <li>A GET of /.well-known/security.txt.</li>
              <li>
                On DNS-verified domains only: a GET of a small fixed list of
                commonly-leaked paths, such as /.env and /.git/HEAD.
              </li>
            </ul>
            <p className="mt-4 text-[15px] leading-relaxed text-slate">
              A single scan is hard-capped at 24 HTTP requests in total. Every
              request identifies itself as SecurePulseBot with a link back to
              this page.
            </p>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-xl font-bold">
              What we will never do
            </h2>
            <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-slate">
              <li>No exploitation, payloads, injection attempts, or fuzzing.</li>
              <li>No authentication bypass, credential testing, or brute force.</li>
              <li>No port scanning or network-layer probing.</li>
              <li>No volumetric traffic. Every scan is rate- and request-capped.</li>
              <li>
                No path discovery on a domain whose ownership has not been
                proven with a DNS record.
              </li>
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-xl font-bold">
              Why verification gates the deeper checks
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate">
              Checking for an exposed .env file means requesting paths other
              than the homepage. That is still an ordinary GET, but a tool that
              did it against any domain anyone typed in would be a convenient
              reconnaissance service. Requiring a DNS TXT record means the
              person asking controls the domain&rsquo;s DNS, so those checks
              only ever run against sites the requester is responsible for.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-slate">
              The anonymous scanner on the homepage never runs them at all.
            </p>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-xl font-bold">
              What a passing grade does not mean
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate">
              A good SecurePulse grade means the configuration a browser can
              see is sound. It is not a penetration test and it says nothing
              about your application code, your database, your dependencies, or
              anyone&rsquo;s access to your server. We will not let the report
              imply otherwise, because a false sense of security is worse than
              none.
            </p>
          </section>

          <section className="mt-10 border border-rule bg-surface p-5">
            <h2 className="font-display text-[17px] font-bold">
              If you believe we scanned your site in error
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-slate">
              Every scan is recorded with its source and timestamp. Contact us
              and we will tell you exactly what was requested and block the
              domain from future scans.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

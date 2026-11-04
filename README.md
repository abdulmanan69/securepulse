# SecurePulse

**Continuous website security monitoring for agencies, freelancers and SMBs.**

A site's security posture decays quietly. Certificates expire, security headers
get dropped in a redeploy, DNS records drift during a migration. A one-off
audit is out of date within two months. SecurePulse re-runs a twelve-point
check every day and emails you the moment the grade falls.

> **Scope.** SecurePulse performs **passive configuration review only**. It
> reads what a server already serves to any browser or crawler. It never
> exploits, fuzzes, brute-forces or port-scans anything. See
> [Scanning policy](#scanning-policy).

---

## Status

Every claim below was verified by running it. See
[docs/TEST-RESULTS.md](docs/TEST-RESULTS.md) for the raw output.

| Area | State |
|---|---|
| Scan engine (12 checks, weighted grade) | Working, 35 unit tests + live tests against real sites |
| Email + password auth, DB-backed sessions | Working, verified end to end in a browser |
| Password reset | Working, verified end to end. 7 tests |
| Domain management + DNS TXT verification | Working |
| Plan limits enforced server-side | Working, 14 tests |
| Stripe subscriptions | Working in **test mode**. No live keys in this build. 8 tests including forged-webhook rejection |
| Scheduled scans + email alerts | Implemented; alert logic and email persistence tested. Not yet exercised by a real cron in production |
| AI remediation summaries | Working, with a deterministic template fallback when no API key is set |
| Agency read-only API + key management | Working, verified end to end. 7 tests |
| CSV / JSON export, bulk scan | Working |
| Dashboard (overview, sites, reports, activity, settings) | Working, with command palette, dark mode and scan-to-scan diffs |
| Deployment | Configured for Vercel + Neon. **Not deployed** — no credentials were used |

Every feature listed on a plan in `src/lib/billing/plans.ts` is implemented
and enforced server-side. Nothing is sold that does not exist.

**Not built:** server-side PDF generation (the client report is a
print-optimised page that saves to PDF from any browser) and email
verification on signup. Both are in [Remaining work](#remaining-work).

---

## Quick start

Requires Node 20+. Nothing else — no database to install, no credentials.

```bash
npm install
npm run db:generate   # only if you change the schema
npm run db:migrate    # builds the local database
npm run dev           # http://localhost:3000
```

Then open the site and scan a domain. It works immediately, with no `.env` at
all.

Optionally seed a development account:

```bash
npm run seed          # demo@securepulse.local / correct horse battery staple
```

> **Stop the dev server before running `seed`, `db:migrate` or `db:reset`.**
> The local database is PGlite, which is an *embedded, single-process*
> Postgres. A running dev server holds the data directory open, so writes made
> by a separate script are not visible to it until you restart. This only
> affects local development; with `DATABASE_URL` set there is no such
> constraint.

### Configuration

Copy `.env.example` to `.env.local`. Every variable is documented there.

The app runs with nothing set. Each integration degrades to a clearly labelled
disabled state rather than crashing:

| Unset | Behaviour |
|---|---|
| `DATABASE_URL` | Uses PGlite against `.data/pg`. Real Postgres, zero setup. |
| `STRIPE_*` | Billing disabled. The UI says so; it never implies payments work. |
| `RESEND_API_KEY` | Emails are written to the `emails` table with full bodies, and not transmitted. That table is the dev inbox. |
| `ANTHROPIC_API_KEY` | Remediation summaries use a deterministic template built from the same findings. |

In **production**, `APP_SECRET` and `CRON_SECRET` are required and the server
refuses to start without them.

---

## What it checks

Twelve checks weighted to 100 points. The weighting reflects consequence, not
effort.

| Category | Points | Checks |
|---|---|---|
| Encryption & certificates | 25 | HTTPS reachable and HTTP upgrade; certificate trusted and days to expiry; TLS version |
| Security headers | 34 | HSTS; CSP (graded on whether it would stop anything); clickjacking; nosniff; Referrer-Policy; Permissions-Policy |
| Cookies | 8 | Secure, HttpOnly, SameSite on cookies set by the homepage |
| Email & DNS | 15 | SPF (and whether it restricts); DMARC (and whether it enforces); CAA |
| Page content | 9 | Mixed content; outdated front-end libraries |
| Information disclosure | 6 | Exact software versions in response headers |
| Disclosure policy | 3 | `security.txt` |
| Exposed files | penalty | `.env`, `.git`, database dumps. Verified domains only. |

### How the grade is computed

Three rules, each chosen so scores stay comparable across sites and over time,
which is what makes the trend line and the regression alert mean anything:

1. **The denominator is fixed at 100.** Every check contributes its points
   whether it passed, failed, or could not be assessed. If an unreachable site
   silently shrank the denominator, it could out-score a working one.
2. **Exposed files apply a flat penalty** (30 points each) *after* the
   weighted total, rather than costing a slice of one category. A publicly
   readable `.env` must not leave a site looking healthy because its headers
   are tidy.
3. **Grades:** A+ ≥97, A ≥90, B ≥80, C ≥70, D ≥60, F below.

Real results from the live suite: `github.com` → **B (87)**,
`example.com` → **F (51)**, `neverssl.com` → **F (25)**.

---

## Architecture

```
src/
  app/
    page.tsx                     Landing page with the free public scanner
    (auth)/                      Sign in, sign up, forgot / reset password
    dashboard/
      page.tsx                   Overview: portfolio, issues, certificate watch
      sites/                     Site list, and detail with the trend chart
      reports/                   Every scan, paginated and filterable
      scans/[id]/                Findings, evidence, diff against last scan
      activity/                  Audit log and the transactional email record
      settings/                  Profile, password, API keys, danger zone
      billing/                   Plan and Stripe portal
    report/[id]/                 Print-optimised client report
    api/
      auth/*                     Session auth and password reset
      account/*                  Profile, password, API keys, deletion
      domains/[id]/verify        DNS TXT ownership proof
      scans                      Authenticated scan (quota + rate limited)
      scans/bulk                 Scan every site, stops cleanly at quota
      scans/[id]/export          CSV / JSON download
      scan/public                Anonymous scan (IP rate limited, passive only)
      billing/{checkout,portal}  Stripe
      stripe/webhook             The only thing that grants a paid plan
      cron/scan                  Scheduled run, shared-secret authenticated
      v1/*                       Agency read-only API, bearer-key authenticated
  lib/
    scanner/
      hostname.ts                Input parsing + SSRF address blocklist
      fetcher.ts                 Budgeted HTTP, guarded DNS, TLS inspection
      checks/                    One module per category. Pure functions.
      score.ts                   Weighting and grading
      engine.ts                  Gathers evidence once, runs every check
    auth/                        scrypt hashing, opaque DB-backed sessions
    billing/                     Plan definitions, server-side limits, Stripe
    email/                       Transactional email, logged before dispatch
    ai/remediation.ts            Written summary, with template fallback
    api-keys.ts                  Agency key issuance, auth and revocation
    portfolio.ts                 Cross-site aggregates and scan-to-scan diffs
```

**The scanner is pure.** `gatherEvidence()` does all the network work once;
every check is a synchronous function from that evidence bundle to findings.
That is why the entire scoring system is testable against fixtures with no
network at all, and why adding a check cannot accidentally add a request.

### Stack and why

| Layer | Choice | Reason |
|---|---|---|
| Next.js App Router | One deployable for marketing, app and API |
| Drizzle + Postgres | SQL-first, no codegen step, same dialect everywhere |
| PGlite in dev | Real Postgres in WASM. Zero-setup clone-and-run, and the *same* migrations run in production |
| First-party auth | No third-party dependency or credential needed to run or test it. Opaque DB-backed sessions are revocable; a JWT is not |
| scrypt | Ships in Node. No native module to compile, nothing in the auth path from npm |
| undici | Lets the scanner validate resolved IPs **at connect time**, which is what closes the DNS-rebinding hole |

---

## Security

Full review in [docs/SECURITY.md](docs/SECURITY.md). The parts specific to
this product:

**SSRF is the defining risk.** Users hand us a hostname and the server then
requests it. Defence is layered: IP literals and internal suffixes are
rejected at parse time; a custom DNS lookup is wired into the *connect* path
so the address that gets validated is the address the socket uses, which a
resolve-then-fetch pre-flight cannot guarantee; and redirects are followed
manually so every hop is re-validated. Verified by a live test against a
public hostname that resolves to loopback — the connection is refused.

**Abuse controls.** Every scan is capped at 24 HTTP requests. Anonymous scans
are rate-limited per IP and never run path discovery. Rate limiting is stored
in Postgres with an atomic upsert, not an in-process map, because on
serverless a per-instance counter is not a limit at all (tested: 10 concurrent
requests against a limit of 5 yield exactly 5 allowed).

**Billing integrity.** The Stripe webhook is the only thing that grants a paid
plan. Signatures are verified against the raw body, and entitlement is derived
from the *price that was billed*, never from anything the request claims.
Tested: an unsigned, forged, wrong-secret or tampered payload is rejected and
the plan stays free.

**Entitlement is evaluated on read.** A `past_due`, `canceled` or lapsed
subscription resolves to `free` even if the stored plan column still says
`pro`, so a webhook we never received cannot leave someone on a paid plan
indefinitely.

---

## Interface

The dashboard is built to be read quickly by someone who looks after a dozen
sites they did not build:

- **Overview** rolls issues up *by check* rather than by site, because the
  answer to "what do I have to fix" is usually one header missing on nine of
  them. Certificates near expiry get their own list.
- **Command palette** (`Cmd-K` / `Ctrl-K`) jumps to a site, runs a scan, or
  opens a page without navigating to find the control first. `?` lists every
  shortcut.
- **Reports** show what *changed* since the previous scan, not only what is
  true now. That is the difference between monitoring and a spot check.
- **Findings** filter by status, severity and category, carry their evidence,
  and every fix is one click to the clipboard. Any scan exports to CSV or JSON.
- **Dark mode** is a selected palette, not an inversion: the accent is lifted
  and every status colour is re-stepped against the dark surface. It follows
  the system preference until you override it.
- Every status is carried by a word and a shape as well as a colour, so a
  report survives being printed in greyscale for a client.

## Testing

```bash
npm test                              # 108 tests, no network, no credentials
LIVE=1 npx vitest run tests/live      # 11 more, against real sites
npm run typecheck && npm run lint
```

Tests run against an **in-memory PGlite** database built by replaying the real
migration files, so a broken migration fails the suite instead of failing a
deploy. `tests/setup.ts` unsets `DATABASE_URL`, so the suite cannot reach a
real database.

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full walkthrough
(Vercel + Neon + Stripe + Resend, and the cron setup).

Nothing in this repository has been deployed, and no live credentials were
used to build it.

---

## Scanning policy

SecurePulse requests: the homepage over HTTPS and HTTP, a TLS handshake on
443, public DNS records, `/.well-known/security.txt`, and — **only on
DNS-verified domains** — a small fixed list of commonly-leaked paths.

It never exploits, fuzzes, brute-forces, port-scans, or sends volumetric
traffic. Path discovery is gated on ownership proof specifically so the tool
cannot be pointed at someone else's site as a reconnaissance service. Every
scan is written to an audit log with its source address.

A good grade means the configuration a browser can see is sound. It is **not**
a penetration test and says nothing about application code, dependencies, or
who has access to the server. The product states this on the report itself.

---

## Remaining work

Honest list of what a paying customer would notice missing:

1. **Server-side PDF.** The client report is a print-optimised page. It works
   and saves to PDF from any browser, but a one-click `.pdf` download is what
   agencies will eventually ask for.
2. **Email verification on signup.** An account can be created with an address
   the user does not control. Low impact today, but it should be closed.
3. **Scheduled runs have not been exercised against a live cron.** The logic
   is tested; the trigger has not run in production.
4. **Scan concurrency.** The scheduled run processes domains serially with a
   batch cap of 25. Fine to a few hundred domains; needs a queue beyond that.
5. **Email deliverability.** Requires a verified sending domain with SPF and
   DKIM before alerts will land reliably.
6. **Public report sharing** was deliberately left out. A link that exposes a
   client's security weaknesses to anyone who has the URL needs expiry,
   revocation and a considered threat model. Half-building it would be worse
   than not having it.

## Business documentation

- [docs/DECISION.md](docs/DECISION.md) — why this product, and why not the alternatives
- [docs/GO-TO-MARKET.md](docs/GO-TO-MARKET.md) — pricing rationale and customer acquisition plan
- [docs/SECURITY.md](docs/SECURITY.md) — security review
- [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md) — what was actually run, and the output

# Business Decision Record — 2026-09-20

## Decision

Build **SecurePulse** — continuous website security & compliance monitoring SaaS for
web agencies, freelancers and SMBs.

This **replaces** the default "AI Content Studio" direction. Reasoning below.

## Why not AI Content Studio

| Factor | Assessment |
|---|---|
| Competition | Extremely saturated: Jasper, Copy.ai, Writesonic, Rytr, plus ChatGPT/Claude direct. Hundreds of identical micro-SaaS clones. |
| Differentiation | Near zero. The product *is* a thin wrapper over an LLM API that customers already have cheaper access to. |
| Unit economics | Bad. Every unit of value costs LLM tokens. Heavy users are loss-making on a $19/mo plan. |
| Moat | None. A competitor rebuilds it in a weekend. |
| Founder fit | Ignores the founder's actual credential (cyber security). |
| Churn | High — output is a commodity, switching cost is zero. |

Verdict: buildable, but a poor business. Rejected.

## Why SecurePulse

| Factor | Assessment |
|---|---|
| Real, recurring problem | A site's security posture **decays over time** — certs expire, headers get dropped on redeploy, DNS records drift, libraries go stale. A one-off audit is worthless in 60 days. Decay is what makes this a *subscription* rather than a one-time purchase. |
| Founder fit | Directly uses a BS Cyber Security background. Credibility is the marketing asset. |
| Unit economics | Excellent. A scan is a handful of HTTP requests + DNS lookups. Marginal cost ≈ fractions of a cent. Gross margin >95%. AI is used only for the remediation write-up (one bounded call per report, cached). |
| Recurring by nature | "Monitoring" only makes sense as a subscription. Churn is structurally low — cancelling means going blind. |
| Marketing | The free public scanner is the lead magnet and the SEO engine. "free website security scan" / "check security headers" / "is my SSL expiring" are high-intent, high-volume queries. Shareable grade (A–F) drives organic distribution. |
| Reseller wedge | Agencies resell white-label reports to their own clients. They pay for a tool that makes *them* look professional. B2B2C = higher willingness to pay, lower churn. |
| Cost to operate | ~$0 fixed at MVP scale (Vercel Hobby + Neon free tier). |

## Competitive landscape

| Product | Price | Gap we exploit |
|---|---|---|
| SecurityHeaders.com | Free | One-off, headers only, no account, no monitoring, no history, no reports. |
| Mozilla Observatory | Free | Same — a spot check, not a product. |
| Detectify | ~$300+/mo | Enterprise. Massively overkill and overpriced for an SMB or a 5-person agency. |
| Intruder.io | ~$150+/mo | Infrastructure/vuln scanning. Different buyer (IT/security team, not a web agency). |
| Probely / Pentest-Tools | ~$100+/mo | Active DAST. Needs authorization, tuning, and someone who can read the output. |
| UptimeRobot / Better Uptime | $0–$30/mo | Uptime only. No security posture at all. |

**The gap:** there is nothing good between *"free one-off spot check"* and *"$150+/mo enterprise
scanner."* Small agencies and SMBs sit in that gap. SecurePulse is priced at **$19–$49/mo** and is
explicitly built for the non-specialist: plain-English findings, a client-ready PDF, and an email
when something breaks.

## Scope & ethics guardrails (hard constraints)

SecurePulse performs **passive, non-intrusive** assessment only. It reads what a server
voluntarily serves to any ordinary browser or crawler.

**Permitted:** HTTP response headers, TLS certificate metadata, public DNS records,
`/robots.txt`, `/security.txt`, homepage HTML for mixed content and library versions,
HTTP→HTTPS redirect behaviour, `Set-Cookie` attributes.

**Forbidden, and never implemented:**
- No exploitation, payloads, or fuzzing of any kind
- No authentication bypass, credential testing, or brute force
- No port scanning or network-layer probing
- No volumetric traffic — every scan is hard-capped in request count and rate
- No scanning of a domain the requester has not proven they control, beyond the strictly
  header-level public check that any browser performs

**Abuse controls:** sensitive-path discovery (`/.env`, `/.git/HEAD`, …) runs **only** on a
DNS-TXT-verified domain. Anonymous public scans are rate-limited by IP and restricted to the
passive header/TLS subset. Every scan is written to an audit log with actor and timestamp.

This keeps SecurePulse on the same legal and ethical footing as SecurityHeaders.com or any
search-engine crawler, and keeps it useless as an attack tool.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One deployable for marketing site, app, and API. Server Actions and Route Handlers cover the whole backend. |
| Styling | Tailwind CSS | Fast, consistent, no bespoke CSS to maintain. |
| Database | PostgreSQL | Standard. Neon/Supabase free tier in production. |
| Local DB | PGlite (Postgres compiled to WASM) | **Zero-setup dev.** Real Postgres semantics, no Docker or install required, and the *same* migrations run against a hosted Postgres in production. Docker Postgres is also supported by setting `DATABASE_URL`. |
| ORM | Drizzle | Same SQL dialect against PGlite and hosted Postgres, SQL-first migrations, no codegen step. |
| Auth | First-party email+password, DB-backed opaque sessions | No third-party dependency or credentials required to run or test. Server-side revocable, unlike stateless JWT. scrypt password hashing (Node built-in, no native build). |
| Payments | Stripe, **test mode** | Industry standard, excellent test story. No live keys in this build — nothing pretends otherwise. |
| AI | Claude API | Remediation guidance + executive summary. Falls back to deterministic templates when no key is set, so the feature is testable offline. |
| Email | Resend in production, file/console transport in dev | Flows are fully testable without credentials. |
| Hosting | Vercel + Neon | $0 to start, scales, cron built in. |

## MVP definition (what "done" means)

1. Public marketing site with a working free scanner (no account needed)
2. Email+password auth with sessions
3. Domain management + DNS TXT ownership verification
4. Scan engine — 12 passive check families, weighted A–F grade
5. Dashboard: domains, scan history, drill-down report, grade trend
6. Plan-based usage limits enforced server-side
7. Stripe test-mode checkout + webhook + subscription lifecycle
8. Scheduled scans via cron + email alerts on grade regression
9. Rate limiting, input validation, audit log
10. Automated tests over the engine, limits, auth, and billing logic

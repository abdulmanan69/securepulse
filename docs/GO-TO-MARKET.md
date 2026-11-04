# Pricing and customer acquisition

## Part 1 — Pricing

### The plans

| | Free | Pro — $19/mo | Agency — $49/mo |
|---|---|---|---|
| Domains | 1 | 5 | 25 |
| Scans / month | 5 | 150 | 750 |
| Automatic scans | — | Daily or weekly | Daily or weekly |
| Grade-drop email alert | — | ✓ | ✓ |
| Certificate expiry warning | — | ✓ | ✓ |
| Exposed file detection | — | ✓ | ✓ |
| Written fix guidance | — | ✓ | ✓ |
| Client-ready report | — | ✓ | ✓ white-label |
| API access | — | — | ✓ |

### Why these numbers

**Free is a lead magnet, not a product.** One domain and five scans is enough
to see a real report and understand the value, and useless for actually
monitoring anything. The thing Free deliberately withholds is *automation* —
which is the entire product. A free user who wants to stop checking manually
has exactly one upgrade path.

**$19 is below the approval threshold.** A freelancer or small agency owner
can expense $19 without asking anyone. The moment a price needs a conversation
with a boss, the sales cycle goes from minutes to weeks. The nearest
alternatives (Detectify, Intruder, Probely) start at $100–$300/month and are
sold to security teams, not to the person who built the website.

**$49 is priced against resale, not cost.** An agency monitoring 25 client
sites pays $1.96 per site per month, and can reasonably bill $10–$25/month per
site as part of a care plan. The plan pays for itself at the second client.
White-labelling is the only feature gated here, because it is the one that
turns SecurePulse from a cost into a line item the agency marks up.

**Scan allowances are generous on purpose.** 150 scans covers 5 domains scanned
daily with room for manual re-checks after a fix. A customer who hits the limit
is over-using the product, not being squeezed — and the limit exists to bound
abuse, not to force upgrades. Limits that bite during normal use produce
churn, not revenue.

### Unit economics

| Item | Cost |
|---|---|
| One scan (≈13 HTTP requests + DNS) | fractions of a cent |
| AI summary | bounded at 1,400 output tokens, generated **once per scan** and cached on the row |
| Hosting (Vercel Hobby/Pro + Neon free) | $0–$20/month, flat |

A Pro customer at full 150-scan usage costs well under $1/month to serve.
**Gross margin is above 95% and does not degrade with usage**, which is the
structural reason this was chosen over an AI content tool where every unit of
value burns tokens and heavy users are loss-making.

### Where the pricing is uncertain

Honest unknowns that only contact with customers will settle:

- $19 may be **too low**. Agencies have shown willingness to pay more for
  anything client-facing. Test $29 for Pro once there are ~20 paying customers.
- The Free tier may be too generous at 5 scans; 3 may convert better.
- Annual billing (2 months free) is not implemented and typically lifts
  cash-flow and retention materially. Add it before any paid acquisition.
- **Team seats** are the most requested agency feature and are not built. They
  were deliberately left off the plan listing rather than advertised, because
  selling a feature that does not exist is the fastest way to lose the trust
  this product is entirely built on. Add them, then add the line.

---

## Part 2 — Customer acquisition

Ordered by cost-to-first-customer. Nothing here involves fake reviews, scraped
lists, cold-mailing people who did not ask, or any claim the product cannot
support.

### 1. The free scanner is the acquisition engine

The public scanner exists to rank and to convert, not as a courtesy. It is the
only channel that compounds.

**Target queries** (high intent, ongoing volume): *free website security scan*,
*check security headers*, *is my SSL certificate expiring*, *what is HSTS*,
*website security checklist for small business*, *SPF and DMARC checker*.

Already built for this:
- Every scan produces a shareable result with a letter grade — inherently
  social, the way page-speed scores are.
- `/what-we-check` is a genuine methodology page, the kind that earns links
  because other people cite it.
- `/scanning-policy` is unusual and builds the trust that converts a security
  purchase.

**Next step:** a per-check landing page (`/check/hsts`, `/check/dmarc`, …) that
explains one issue properly and ends in a scan box. Twelve pages, each
targeting a real query, each the best free answer to it.

### 2. Write from the credential

The founder is a cyber security student. That is the differentiator against a
generic SaaS, and it only works if the writing is genuinely good.

Publish teardowns: *"I scanned 100 small business websites. 78 had no CSP."*
Run it, publish the methodology and the anonymised data. That is a real
finding, it is defensible because the tool actually produced it, and it is the
kind of post that gets linked.

Venues where this is welcome **when it is substantive and not promotional**:
r/webdev, r/netsec, Hacker News (Show HN with the free tool as the artefact),
Indie Hackers, dev.to.

### 3. Go where agencies already are

The Agency plan is the highest-value segment and the easiest to reach, because
agencies congregate.

- **WordPress care-plan communities.** Agencies selling monthly maintenance
  already sell "security" and mostly have nothing concrete to show for it. A
  white-label monthly report is a tangible deliverable for a plan they are
  already charging for.
- **Partner offer:** free Agency plan for 3 months in exchange for a case
  study and honest feedback. This is an early-access arrangement, disclosed as
  one — not paid-for praise.
- **Integrations** as distribution: a WordPress plugin surfacing the grade in
  wp-admin, and a Zapier/Make connector for grade-drop alerts.

### 4. Direct outreach, done honestly

Scan a prospect's site, then email a **specific, true, useful** finding:

> Your certificate for example.com expires in 9 days and auto-renewal does not
> appear to have run. Here is the full report: [link]. No reply needed — I just
> thought you would want to know before your visitors see a browser warning.

This works because it is a real finding about their own site, delivered with
the fix. It stops being acceptable the moment it becomes volume mail to people
who have no relationship to the sender. Cap it, personalise every one, honour
opt-outs immediately, and never send to an address harvested from a scan.

### 5. What is deliberately excluded

- No fake reviews, testimonials, or invented customer counts.
- No cold-mailing scraped lists.
- No fear-based marketing implying a site is hacked or vulnerable when the
  scan found a missing header. The report language is deliberately measured
  for exactly this reason.
- No claiming this is a penetration test.

### Sequence

| Phase | Focus | Target |
|---|---|---|
| Weeks 1–2 | Add annual billing. Deploy. Scan your own site. | Live and correct |
| Weeks 3–6 | 12 per-check landing pages. Show HN. First teardown post. | First 100 free scans |
| Weeks 7–12 | Agency outreach, 3 case-study partners, WordPress plugin | First 10 paying customers |
| Month 4+ | Double down on whichever channel produced a paying customer; drop the rest | $500 MRR |

### What to measure

Free scans → signups → first domain added → **second scan** (the real
activation event, because it means they came back) → paid conversion.

The leading indicator worth watching above all others: **do free users return
for a second scan?** If they do not, the monitoring value proposition is not
landing, and no amount of traffic will fix that.

---

*No revenue is promised or projected here. This is a plan, and plans are
hypotheses until customers test them.*

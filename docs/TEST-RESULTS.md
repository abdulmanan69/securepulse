# Test results

Everything below was executed. Where a feature is not verified, it says so.

## Automated suite

```
$ npm test
 Test Files  10 passed | 3 skipped (13)
      Tests  108 passed | 11 skipped (119)
```

| Suite | Tests | Covers |
|---|---|---|
| `hostname.test.ts` | 16 | SSRF blocklist, hostname parsing, boundary addresses either side of every private range, IPv4-mapped IPv6 unwrapping |
| `scanner-scoring.test.ts` | 5 | Grade boundaries, perfect site = 100/A+, broken site = F, fixed denominator |
| `scanner-checks.test.ts` | 30 | Every check family: transport, headers, cookies, content, DNS, exposure penalties |
| `password.test.ts` | 9 | scrypt round-trip, unicode normalisation, malformed and tampered hashes, rehash policy |
| `limits.test.ts` | 14 | Plan entitlement, domain limits, scan quota, billing-period windows, frequency gating |
| `ratelimit.test.ts` | 5 | Fixed-window behaviour, key isolation, expiry, **atomic concurrency**, purge |
| `alerts.test.ts` | 7 | Grade-regression detection, transactional email persistence |
| `stripe-webhook.test.ts` | 8 | Signature verification, forged/tampered payload rejection, entitlement from price id |
| `password-reset.test.ts` | 7 | Token issuance, HMAC-only storage, single use, reissue invalidation, expiry |
| `api-keys.test.ts` | 7 | Key issuance, plan re-check on every call, revocation, cross-account isolation |

Skipped (11) are the opt-in live-network suites. Run with `LIVE=1`.

## Live network suite

```
$ LIVE=1 npx vitest run tests/live
 Test Files  3 passed
      Tests  11 passed
```

Verified against real servers:

- HTTPS fetch with lower-cased headers and capped body
- HTTP→HTTPS upgrade, with the redirect chain recorded
- Real certificate read: issuer, SANs, days to expiry, `authorized`
- `expired.badssl.com` reported as untrusted rather than failing the scan
- **`localtest.me` (public DNS name resolving to loopback) refused at connect
  time** — the SSRF control working against the actual attack
- Request budget enforced
- SPF and DMARC records retrieved

Sample output from a real run:

```
github.com    -> B (87/100) in 1699ms
example.com   -> F (51/100) in 242ms
neverssl.com  -> F (25/100) in 16413ms
```

These match the results the same domains produce through the web UI, which is
how the engine and the app were confirmed to agree.

## Browser end-to-end (manual, via Playwright)

| Flow | Result |
|---|---|
| Landing page renders, security headers present on the response | Pass |
| Anonymous scan of `github.com` from the homepage | Pass — B (87/100), readout populated with real headers, absent ones shown as ghost rows |
| Sign up → redirected to dashboard | Pass |
| Add domain → limit enforced ("all 1 domain slot") | Pass |
| Run scan → report page | Pass — F (51/100) for example.com, matching the CLI result |
| Scan quota decrements (5 → 4) | Pass |
| Sign out → session cleared | Pass |
| Sign in as seeded Pro account | Pass |
| Pro report shows written summary + "Client report" button | Pass |
| Client report renders as a print-ready document | Pass |
| `exposedFileDiscovery: false` on an unverified domain | Pass |
| Command palette opens, groups results, runs a scan | Pass |
| Theme toggle writes `data-theme` + localStorage, both toggles stay in sync | Pass |
| Dark mode renders correctly across the dashboard | Pass |
| Onboarding checklist tracks real state (2 of 4 done) | Pass |
| Mobile (390x844): nav drawer, stacked tiles, responsive checklist | Pass after fix |

## Password reset, verified end to end

Run against the live dev server, not mocked:

| Check | Result |
|---|---|
| Request for a **registered** address | 200, generic message |
| Request for an **unknown** address | 200, **byte-identical** message — no enumeration |
| Token extracted from the recorded email and redeemed | 200 |
| Re-using the same token | 400 `invalid_token` |
| Old password after reset | 401 |
| New password after reset | 200 |
| Pre-existing session cookie after reset | 401 — all sessions destroyed |

## Agency API, verified end to end

| Check | Result |
|---|---|
| Create a key on the **Pro** plan | 402 `feature_not_available` |
| Create a key on the **Agency** plan | 201, full key returned once, prefix stored |
| `GET /api/v1/sites` | 200, correct data, `x-ratelimit-remaining: 119` |
| `GET /api/v1/scans?limit=2` | 200, 2 scans |
| `GET /api/v1/scans/:id` | 200, 18 findings with evidence |
| No `Authorization` header | 401 |
| Unknown key | 401 |
| After revocation | 401 |

The Agency upgrade itself was performed through the **real Stripe webhook**
with a locally signed payload, not by editing the database, so the entitlement
path was exercised as it would be in production.

## Export

`GET /api/scans/:id/export?format=csv` returns
`content-type: text/csv`, `content-disposition: attachment; filename="securepulse-example.com-2026-09-20.csv"`,
and RFC 4180 quoting (verified against findings whose text contains commas,
quotes and apostrophes).

## Build and static analysis

```
$ npm run typecheck     # clean
$ npm run lint          # 0 errors, 0 warnings
$ npm run build         # compiled successfully, 24 routes
```

## Bugs found and fixed during testing

Testing earned its keep — these were real defects caught before shipping:

1. **Hostname check ordering.** `localhost` hit the "needs two labels" rule
   before the internal-host blocklist, producing a misleading error and
   making "typo" indistinguishable from "not permitted". Blocklist moved
   ahead of the structural checks.
2. **Mixed-content false positive.** The detector matched any `href`,
   which would have flagged ordinary outbound `<a href="http://…">` links on
   nearly every site. Rewritten to key off the tag, distinguishing active
   subresources from passive ones. Regression test added.
3. **Test environment ordering.** Env vars set in `tests/setup.ts` were
   applied *after* `src/lib/env.ts` had been evaluated, because ES imports are
   hoisted — all 8 webhook tests failed with 503. Moved to Vitest's `env`
   config, which is guaranteed to run first.
4. **Build required runtime secrets.** `next build` runs with
   `NODE_ENV=production`, so eager env validation demanded production
   credentials to build. Made lazy, with `instrumentation.ts` validating at
   server start instead.
5. **PGlite `mkdir` not recursive.** A clean checkout threw `ENOENT` because
   the parent `.data` directory did not exist.
6. **CSP blocked React's dev build**, which uses `eval()` for callstack
   reconstruction. Scoped `'unsafe-eval'` to development only.
7. **`.gitignore` excluded `.env.example`** via a blanket `.env*`, and did not
   ignore `.data/` — the local database would have been committed.
8. **The trend chart letterboxed itself.** A fixed pixel height plus a viewBox
   made `preserveAspectRatio` fit by height, centring the plot with dead space
   either side. Caught by looking at a screenshot, not by any test.
9. **A zero score change rendered in "good" green.** Neutral is correct.
10. **`setState` inside an effect** in the command palette and the API-key
    panel. Both were real design smells: the palette now resets state in the
    click handler, and the key panel receives server-fetched data as props,
    which also removed a loading flash.
11. **The mobile nav drawer rendered behind the page, with no background.**
    Its trigger lives in a header that uses `backdrop-blur`, and
    `backdrop-filter` makes an element a containing block for
    `position: fixed` descendants - so the drawer was being clipped to the
    56px header box instead of covering the viewport. Fixed by portaling the
    drawer to `document.body`. Only visible at mobile width; no unit test
    would have caught it.
12. **PGlite is single-process.** A running dev server holds the data
    directory, so `seed` and `db:migrate` from a second process are invisible
    to it until restart. This cost a confusing "login is broken" investigation
    and is now documented in the README.

## Not verified

Stated plainly, because the difference matters:

- **Live Stripe payments.** Webhook handling is tested against locally signed
  payloads with fake keys. No real checkout, card, or live key has been used.
- **A real cron firing.** `runScheduledScans()` is implemented and its
  alert logic is tested; the Vercel cron trigger has not run.
- **Real email delivery.** Messages are recorded in the `emails` table. No
  provider key was configured, so nothing has been transmitted.
- **AI summaries against the live API.** The code path runs; with no
  `ANTHROPIC_API_KEY` the deterministic template is used, which is what the
  screenshots show.
- **Production deployment.** Nothing has been deployed.
- **A nested `notFound()` returns HTTP 200, not 404.** Next.js streams the
  layout before the page runs, so the status is already committed by the time
  the page decides the resource is missing. The correct not-found page does
  render. Verified as identical in dev and in a production build, so it is a
  framework limitation rather than a bug in this code. It affects crawlers
  only, and everything under /dashboard requires a session.
- **Dark mode contrast has been eyeballed, not measured.** The palette was
  chosen deliberately against the dark surface rather than inverted, and it
  reads correctly in screenshots, but no automated contrast audit has been run
  over every token pair.

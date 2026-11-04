# Security review

Reviewed 2026-09-20 against the implementation in this repository. Each item
states what was done, and how it was verified.

---

## 1. Server-side request forgery — the defining risk

SecurePulse takes a hostname from an untrusted user and makes the server
request it. Without controls this is a direct SSRF primitive: point it at
loopback, at RFC1918 space, or at a cloud metadata endpoint and read the
response back through our own report UI.

**Controls, layered:**

| Layer | Implementation |
|---|---|
| Parse-time rejection | `normalizeHostname()` rejects IP literals, non-http(s) schemes, embedded credentials, and reserved suffixes (`.local`, `.internal`, `.onion`, `localhost`, …). |
| Connect-time validation | A custom `lookup` is installed on the undici agent, so every resolved address is checked **inside the connect path**. |
| Redirect re-validation | Redirects are followed manually (`maxRedirections` disabled), so each hop goes back through the guarded lookup. Non-http(s) redirect targets throw. |
| Blocklist | Full RFC 1918 / 6890 IPv4 reserved space, IPv6 loopback, unique-local, link-local and multicast, plus IPv4-mapped and NAT64 forms unwrapped and re-checked. Unparseable addresses are treated as unsafe. |

**Why connect-time and not pre-flight.** A resolve-then-fetch check leaves a
DNS-rebinding window: the attacker answers the first lookup with a public
address and the second — the one the socket actually uses — with loopback.
Validating inside the lookup means the address validated is the address
connected to.

**Verified.** `tests/live/network.test.ts` requests `https://localtest.me/`, a
public DNS name that resolves to loopback. The connection is refused.
`tests/hostname.test.ts` covers 16 cases including boundary addresses either
side of each private range.

---

## 2. Authentication

| Concern | Implementation |
|---|---|
| Password storage | scrypt (N=65536, r=8, p=1), 16-byte random salt, 64-byte key. Parameters stored in the hash string so they can be raised without invalidating existing hashes; `needsRehash()` upgrades on next login. |
| Verification | Constant-time `timingSafeEqual`. Malformed stored hashes return `false` rather than throwing. Absurd parameters from a tampered row are refused before allocating. |
| User enumeration on login | A dummy hash is verified when the email is unknown, so a missing account costs the same time as a wrong password. One error message for both cases. |
| Sessions | 32 bytes of CSPRNG entropy, base64url. The **raw token is never stored** — the database holds an HMAC-SHA256 of it keyed on `APP_SECRET`, so a dump of the sessions table yields no usable credential. |
| Revocation | Server-side rows, so logout and `destroyAllSessions()` take effect immediately. A stateless JWT could not do this. |
| Cookie | `httpOnly`, `sameSite=lax`, `secure` in production, 30-day expiry. |
| Brute force | Login is rate-limited **per email** (10 / 15 min) rather than per IP, because credential stuffing rotates source addresses but must keep hitting the same account. |

**Password reset** issues a 32-byte token, stores only its HMAC, expires it in
one hour, and marks it used on redemption with a conditional update so two
requests racing the same link cannot both succeed. Requesting a new link
invalidates the previous one. Redemption destroys every existing session,
because a reset is the standard response to "someone else may be in my
account" and is worthless if their session survives it.

The request endpoint returns an **identical response whether or not the
address has an account** - including when rate-limited, since a 429 that only
appeared for real accounts would leak exactly what the identical response
exists to hide.

**Known gap:** signup necessarily reveals whether an email is registered (the
account is either created or not). A clear message was chosen over a
misleading fake success.

**Verified.** `tests/password.test.ts`, 9 tests including unicode
normalisation, tampered parameters, and malformed hashes.

---

## 3. Authorization

Every domain and scan lookup is scoped by `userId` in the query itself, not
filtered after fetching. `getOwnedDomain(userId, domainId)` takes the user id
as a **required** argument, which makes it impossible to write a handler that
looks up by id alone.

A resource belonging to another account returns **404, not 403**, so the
endpoints cannot be used to enumerate which domains other accounts monitor.

**API keys** follow the same rules. Only an HMAC is stored and the full key is
shown exactly once. Every request re-resolves the caller's plan rather than
trusting the key's existence, so a downgrade or a failed payment disables it
immediately. Revocation takes effect on the next request. Keys are scoped to
their owner in the query itself, and one account cannot revoke another's key.
Verified by test.

---

## 4. Billing integrity

The Stripe webhook is the only code path that grants a paid plan.

- Signature verified against the **raw request body**, before parsing.
- No signing secret configured ⇒ the endpoint refuses everything (503). It
  does not silently succeed, which on a misconfigured deployment would let
  anyone grant themselves a plan.
- Entitlement is derived from the **price that was billed**, never from
  metadata or any client-supplied field.
- Unhandled event types return 200, because a non-2xx makes Stripe retry
  forever.
- Handler failures return 500 deliberately, so Stripe retries a transient
  database error.

**Entitlement is re-evaluated on every read.** `resolveActivePlan()` downgrades
`past_due`, `canceled`, `unpaid` and lapsed-period subscriptions to `free`
regardless of the stored plan column, so a missed webhook cannot leave someone
on a paid plan indefinitely.

**Verified.** `tests/stripe-webhook.test.ts`, 8 tests. Unsigned, forged,
wrong-secret and tampered-after-signing payloads are all rejected **and the
plan is confirmed to remain `free`**.

---

## 5. Input validation

Every request body is **parsed** through a Zod schema, not merely validated.
Handlers receive a typed value with unknown keys stripped, so an extra field
in a request cannot reach a database write.

Injection is structurally prevented: all database access goes through Drizzle's
parameterised query builder. The only raw SQL is in test helpers and migration
replay, both operating on literals under our control.

---

## 6. Rate limiting and abuse

| Surface | Limit |
|---|---|
| Anonymous scan | 5 / hour per IP |
| Login | 10 / 15 min per email |
| Signup | 5 / hour per IP |
| Authenticated scan | 30 / hour per user, **on top of** plan quota |
| Domain verification | 20 / hour per domain |
| Password reset request | 5 / hour per email, 15 / hour per IP |
| Password reset redemption | 20 / hour per IP |
| Bulk scan | 3 / hour per account |
| Agency API | 120 / minute per key |

Counters live in Postgres and increment via a single atomic upsert. An
in-process map was rejected because the app runs as serverless functions,
where a per-instance counter resets on every cold start.

**Verified.** 10 concurrent requests against a limit of 5 produce exactly 5
allowed (`tests/ratelimit.test.ts`).

**Scanner abuse controls:** 24 HTTP requests per scan maximum, 10s per-request
timeout, 512 KB response body cap, 5 redirect hops. Path discovery requires
DNS ownership proof. Every scan is written to an append-only audit log with
actor and source IP.

---

## 7. Secrets and output

`src/lib/env.ts` is the single access point and is marked `server-only`, so
importing it from a client component is a **build error**, not a runtime
mistake. No secret is exposed under `NEXT_PUBLIC_*` except the Stripe
publishable key, which is designed to be public.

`handleApiError()` returns a generic 500 for anything unrecognised and logs
the detail server-side. Internal error text routinely contains table names,
paths and query fragments.

The AI summary is rendered by a **structural Markdown parser that emits React
elements** — never `dangerouslySetInnerHTML`. Model-generated text is
untrusted input to a browser, and parsing a known subset makes script
injection structurally impossible rather than something to sanitise.

---

## 8. Response headers

SecurePulse passes its own check. Set in `next.config.ts`: HSTS, CSP,
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Permissions-Policy`, `Cross-Origin-Opener-Policy`. `poweredByHeader` is off.

**Documented weakness:** the CSP includes `'unsafe-inline'` for scripts,
because Next.js injects inline bootstrap scripts and a nonce-based policy
requires custom middleware on every route. `'unsafe-eval'` is added **in
development only** — React's dev build needs it and its production build never
does.

---

## 9. Dependencies

`npm audit`: **4 moderate**, all one root cause — `esbuild`'s dev-server CORS
advisory, reaching us transitively through `drizzle-kit`.

Assessment: **accepted.** `drizzle-kit` is a `devDependency` used only to
generate migration SQL. It is not in the production bundle and its dev server
is never started. Fixing it requires a `drizzle-kit` major upgrade with
breaking config changes, which is not justified for a vulnerability that
cannot be reached in this deployment. Re-evaluate when drizzle-kit ships a
patched release.

Runtime dependencies are deliberately few: `next`, `react`, `drizzle-orm`,
`postgres`/`@electric-sql/pglite`, `undici`, `zod`, `stripe`, `resend`,
`@anthropic-ai/sdk`. Authentication depends on **nothing** outside Node's
standard library.

---

## 10. Legal and ethical posture

The scanner is restricted to what any browser or crawler already receives,
which places it on the same footing as SecurityHeaders.com or a search engine
crawler. The controls that keep it there:

- No exploitation, fuzzing, credential testing or port scanning exists in the
  codebase — not disabled, not present.
- Path discovery requires DNS ownership proof, so the tool cannot be used as a
  reconnaissance service against third parties.
- The anonymous scanner never performs path discovery at all.
- The product refuses to imply a passing grade means more than it does. Report
  and marketing copy both state it is not a penetration test.
- Every scan is attributable via the audit log if a site owner ever objects.

---

## Open items before charging real money

1. **No email verification**, so accounts can be created with an address the
   user does not control. Low impact today (nothing is sent to unverified
   addresses except the welcome mail) but it should be closed.
2. **No 2FA.**
3. **CSP still uses `'unsafe-inline'`** for scripts, because Next.js injects
   inline bootstrap scripts. Move to a nonce-based policy via middleware.
4. **No automated dependency scanning in CI.**
5. **The theme preference is read by an inline script.** It is a single
   attribute write with a hard-coded allowlist of two values, and it exists
   only because the CSP already permits `'unsafe-inline'`. It should move to a
   server-read cookie when that policy is tightened.

**Closed since the first review:** password reset now exists, and sessions are
rotated on both password change and reset (`destroyAllSessions()` is wired to
both), which closes the session-fixation item.

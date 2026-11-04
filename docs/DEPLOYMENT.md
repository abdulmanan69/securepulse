# Deployment

Target: **Vercel + Neon**. Roughly $0/month at launch scale; both have free
tiers that comfortably cover early customers.

> Nothing here has been executed. No account was created, no credential was
> used, and nothing was deployed. These are the steps to do it.

---

## 1. Database (Neon)

1. Create a project at neon.tech and copy the **pooled** connection string.
2. Run the migrations against it from your machine:

```bash
DATABASE_URL="postgresql://…?sslmode=require" npm run db:migrate
```

The same migration files that built your local PGlite database run here
unchanged — that is the point of using real Postgres locally.

Supabase, RDS, or a Docker Postgres all work identically. Only
`DATABASE_URL` changes.

---

## 2. Secrets

Generate the two required values:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # APP_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # CRON_SECRET
```

Rotating `APP_SECRET` invalidates every session, by design.

---

## 3. Stripe

1. Create two recurring products: **Pro $19/mo** and **Agency $49/mo**.
2. Copy each **price ID** (`price_…`) into `STRIPE_PRICE_ID_PRO` /
   `STRIPE_PRICE_ID_AGENCY`. The plan a customer receives is derived from the
   price that was billed, so these must be right.
3. Add a webhook endpoint pointing at `https://<your-domain>/api/stripe/webhook`
   subscribed to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

**Both** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must be set. With a
key but no webhook secret the app disables billing deliberately: checkout
would otherwise succeed while the subscription was never recorded, meaning the
customer pays and receives nothing.

Stay on **test keys** (`sk_test_…`) until you have run a full subscribe,
upgrade, cancel and failed-payment cycle. The UI reads the key prefix and
labels the mode honestly.

Test the webhook locally:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe trigger customer.subscription.updated
```

---

## 4. Email (Resend)

1. Add and **verify your sending domain**, including SPF and DKIM records.
   Alerts sent from an unverified domain will land in spam, which makes the
   core feature invisible.
2. Set `RESEND_API_KEY` and `EMAIL_FROM`.

Without a key the app still records every message in the `emails` table and
transmits nothing. Query that table to see exactly what would have been sent.

---

## 5. Deploy

```bash
npx vercel
npx vercel --prod
```

Set every environment variable in the Vercel project settings first.
`instrumentation.ts` validates the required ones at server start, so a
misconfigured deployment fails immediately rather than on a customer's first
request.

`vercel.json` already configures:

- A daily cron hitting `/api/cron/scan` at 07:00 UTC.
- Extended `maxDuration` for the scan routes (60s) and the cron route (300s),
  because a scan makes several network round trips.

Vercel Cron sends the project's `CRON_SECRET` as a bearer token automatically.
Any other scheduler works too:

```bash
curl -X POST https://<your-domain>/api/cron/scan \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## 6. Verify the deployment

Run these against production before telling anyone it is live:

1. **Scan yourself.** Put your own domain into the public scanner. It should
   score well — the app sets its own security headers.
2. **Check the headers directly:**
   ```bash
   curl -sI https://<your-domain>/ | grep -iE 'strict-transport|content-security|x-frame'
   ```
3. **Full account cycle:** sign up, add a domain, scan, open the report.
4. **Billing cycle in test mode:** subscribe with card `4242 4242 4242 4242`,
   confirm the plan changes, then cancel in the portal and confirm it reverts
   to Free.
5. **Failed payment:** use `4000 0000 0000 0341` and confirm the account
   downgrades to `free` on the next request.
6. **Cron:** trigger it manually with the curl above and check the returned
   report counts.

---

## Scaling notes

The current design is honest about its limits:

- **Scheduled scans run serially**, capped at 25 domains per invocation. That
  covers a few hundred monitored domains on a daily cadence. Beyond that, move
  to a queue (Vercel Queues, QStash, or a worker) and run scans concurrently.
- **Scans run inline in the request** for manual scans. Above ~10s p95 this
  should move to a job with the UI polling for completion.
- **Outbound reputation.** At volume, run the scanner from a dedicated egress
  IP with reverse DNS pointing at your bot documentation page, so site owners
  who look up the traffic find an explanation.

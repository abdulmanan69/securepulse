import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import type Stripe from 'stripe';

import { getStripe, planForPriceId } from '@/lib/billing/stripe';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import type { Plan } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, ok } from '@/lib/util/api';

export const runtime = 'nodejs';

/**
 * Stripe webhook.
 *
 * This endpoint is the only thing that grants a paid plan, so it is the only
 * thing that has to be right about who paid.
 *
 * Three rules:
 *  1. The signature is verified against the raw request body. An unsigned or
 *     mis-signed request is rejected before it is parsed, because anyone can
 *     POST here.
 *  2. Entitlement is read from the Stripe objects, never from the request
 *     body's claims about which plan to grant.
 *  3. A 200 is returned for anything we have successfully processed or chosen
 *     to ignore. A non-2xx makes Stripe retry, so returning an error for an
 *     event type we do not handle would produce an infinite retry loop.
 */

const HANDLED = new Set<Stripe.Event.Type>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

/**
 * Resolves the local user for a Stripe subscription.
 *
 * Prefers the metadata we set at checkout, and falls back to the customer id
 * already stored against the account. Never trusts an email address: emails
 * are editable in the Stripe dashboard and are not an identity.
 */
async function resolveUserId(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.userId;
  if (fromMetadata) return fromMetadata;

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return null;

  const db = await getDb();
  const rows = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);

  return rows[0]?.userId ?? null;
}

async function applySubscription(subscription: Stripe.Subscription) {
  const userId = await resolveUserId(subscription);
  if (!userId) {
    console.error(
      '[stripe:webhook] could not map subscription to a user',
      subscription.id,
    );
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;
  // The plan comes from the price that was actually billed.
  const resolvedPlan: Plan = planForPriceId(priceId) ?? 'free';

  const db = await getDb();
  await db
    .update(subscriptions)
    .set({
      plan: subscription.status === 'canceled' ? 'free' : resolvedPlan,
      status: subscription.status as (typeof subscriptions.status.enumValues)[number],
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeCustomerId:
        typeof subscription.customer === 'string'
          ? subscription.customer
          : (subscription.customer?.id ?? null),
      currentPeriodStart:
        toDate(item?.current_period_start) ?? new Date(),
      currentPeriodEnd: toDate(item?.current_period_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, userId));

  await recordAudit({
    userId,
    action:
      subscription.status === 'canceled'
        ? AUDIT.subscriptionCanceled
        : AUDIT.subscriptionUpdated,
    targetType: 'subscription',
    targetId: subscription.id,
    meta: { status: subscription.status, plan: resolvedPlan, priceId },
  });
}

export async function POST(request: NextRequest) {
  if (!env.stripe.enabled || !env.stripe.webhookSecret) {
    // Nothing can be verified without the signing secret, so nothing is
    // accepted. Silently succeeding here would let anyone grant themselves a
    // paid plan on a misconfigured deployment.
    return fail(503, 'Billing is not configured.');
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return fail(400, 'Missing signature.');
  }

  // Must be the raw body. Parsing it first would change the bytes the
  // signature was computed over.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      payload,
      signature,
      env.stripe.webhookSecret,
    );
  } catch (error) {
    console.error('[stripe:webhook] signature verification failed', error);
    return fail(400, 'Invalid signature.');
  }

  if (!HANDLED.has(event.type)) {
    // Acknowledge so Stripe stops retrying an event we do not act on.
    return ok({ received: true, handled: false });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.subscription) {
          // Re-fetch rather than trusting the summary on the session: the
          // authoritative price and period live on the subscription itself.
          const subscription = await getStripe().subscriptions.retrieve(
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id,
          );
          await applySubscription(subscription);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscription(event.data.object);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id;

        if (customerId) {
          const db = await getDb();
          await db
            .update(subscriptions)
            .set({ status: 'past_due', updatedAt: new Date() })
            .where(eq(subscriptions.stripeCustomerId, customerId));
        }
        break;
      }
    }

    return ok({ received: true, handled: true });
  } catch (error) {
    // A 500 tells Stripe to retry, which is what we want for a transient
    // database failure. The detail stays in our logs.
    console.error('[stripe:webhook] handler failed', event.type, error);
    return fail(500, 'Webhook handler failed.');
  }
}

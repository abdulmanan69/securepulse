import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/stripe/webhook/route';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { clearAllTables } from './helpers/db';
import { createUser } from './helpers/factories';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

/**
 * The webhook is the only thing in the product that grants a paid plan, so
 * these tests answer one question: can anyone who is not Stripe make it do
 * that?
 */

function subscriptionEvent(userId: string, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'evt_test_1',
    object: 'event',
    type: 'customer.subscription.updated',
    api_version: '2026-08-26.dahlia',
    created: now,
    data: {
      object: {
        id: 'sub_test_1',
        object: 'subscription',
        customer: 'cus_test_1',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { userId },
        items: {
          object: 'list',
          data: [
            {
              id: 'si_test_1',
              object: 'subscription_item',
              price: { id: 'price_test_pro', object: 'price' },
              current_period_start: now,
              current_period_end: now + 30 * 86400,
            },
          ],
        },
        ...overrides,
      },
    },
  };
}

function signedRequest(payload: unknown) {
  const body = JSON.stringify(payload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: WEBHOOK_SECRET,
  });
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    body,
  });
}

beforeEach(async () => {
  await clearAllTables();
});

describe('stripe webhook authentication', () => {
  it('rejects a request with no signature', async () => {
    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body: JSON.stringify(subscriptionEvent('anyone')),
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it('rejects a forged signature', async () => {
    const body = JSON.stringify(subscriptionEvent('anyone'));
    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
      body,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it('rejects a payload signed with the wrong secret', async () => {
    // The exact attack this guards against: someone who knows the payload
    // shape but not our signing secret trying to grant themselves a plan.
    const { user } = await createUser();
    const body = JSON.stringify(subscriptionEvent(user.id));
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: 'whsec_the_attackers_own_secret',
    });

    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);

    const db = await getDb();
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id));
    expect(row.plan).toBe('free');
  });

  it('rejects a body altered after signing', async () => {
    const { user } = await createUser();
    const original = JSON.stringify(subscriptionEvent(user.id));
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: original,
      secret: WEBHOOK_SECRET,
    });

    // Same signature, different body.
    const tampered = original.replace('price_test_pro', 'price_test_agency');
    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body: tampered,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });
});

describe('stripe webhook subscription handling', () => {
  it('grants the plan matching the price that was billed', async () => {
    const { user } = await createUser();

    const response = await POST(signedRequest(subscriptionEvent(user.id)) as never);
    expect(response.status).toBe(200);

    const db = await getDb();
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id));

    expect(row.plan).toBe('pro');
    expect(row.status).toBe('active');
    expect(row.stripeSubscriptionId).toBe('sub_test_1');
    expect(row.stripeCustomerId).toBe('cus_test_1');
    expect(row.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it('ignores the claimed plan and uses the price id', async () => {
    const { user } = await createUser();

    // Metadata claims agency; the price actually billed is pro. Entitlement
    // must follow the money, not a label attached to the request.
    const event = subscriptionEvent(user.id, {
      metadata: { userId: user.id, plan: 'agency' },
    });

    await POST(signedRequest(event) as never);

    const db = await getDb();
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id));
    expect(row.plan).toBe('pro');
  });

  it('drops the plan to free when the subscription is canceled', async () => {
    const { user } = await createUser();
    await POST(signedRequest(subscriptionEvent(user.id)) as never);

    await POST(
      signedRequest(subscriptionEvent(user.id, { status: 'canceled' })) as never,
    );

    const db = await getDb();
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id));
    expect(row.plan).toBe('free');
    expect(row.status).toBe('canceled');
  });

  it('acknowledges an event type it does not handle', async () => {
    const response = await POST(
      signedRequest({
        id: 'evt_x',
        object: 'event',
        type: 'customer.created',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'cus_x', object: 'customer' } },
      }) as never,
    );

    // A non-2xx would make Stripe retry an event we will never act on.
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ handled: false });
  });
});

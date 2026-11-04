import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { getAuth } from '@/lib/auth/session';
import { BillingNotConfiguredError, getStripe, priceIdFor } from '@/lib/billing/stripe';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { AUDIT, recordAudit } from '@/lib/util/audit';
import { fail, handleApiError, ok } from '@/lib/util/api';
import { clientIp } from '@/lib/util/request';
import { checkoutSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const body = checkoutSchema.parse(await request.json());
    const stripe = getStripe();
    const db = await getDb();

    // Reuse the customer if we have one, so a returning subscriber keeps one
    // billing history rather than accumulating duplicate customer records.
    let customerId = auth.subscription?.stripeCustomerId ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.user.email,
        name: auth.user.name ?? undefined,
        // The link back to our user. The webhook relies on this, because a
        // Stripe event arrives with no session and no cookie.
        metadata: { userId: auth.user.id },
      });
      customerId = customer.id;

      await db
        .update(subscriptions)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(subscriptions.userId, auth.user.id));
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceIdFor(body.plan), quantity: 1 }],
      success_url: `${env.APP_URL}/dashboard/billing?checkout=success`,
      cancel_url: `${env.APP_URL}/pricing?checkout=cancelled`,
      allow_promotion_codes: true,
      // Repeated on the subscription so the webhook can attribute it even if
      // the customer metadata is ever edited in the Stripe dashboard.
      subscription_data: {
        metadata: { userId: auth.user.id, plan: body.plan },
      },
      client_reference_id: auth.user.id,
    });

    await recordAudit({
      userId: auth.user.id,
      action: AUDIT.checkoutStarted,
      ip: clientIp(request),
      meta: { plan: body.plan, sessionId: session.id },
    });

    return ok({ url: session.url });
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      return fail(503, error.message, { code: 'billing_not_configured' });
    }
    return handleApiError(error, 'billing/checkout');
  }
}

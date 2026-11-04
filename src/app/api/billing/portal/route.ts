import { getAuth } from '@/lib/auth/session';
import { BillingNotConfiguredError, getStripe } from '@/lib/billing/stripe';
import { env } from '@/lib/env';
import { fail, handleApiError, ok } from '@/lib/util/api';

export const runtime = 'nodejs';

/**
 * Hands the customer to Stripe's own billing portal for card updates,
 * invoices and cancellation. Building those screens ourselves would mean
 * handling card data and dunning logic for no benefit.
 */
export async function POST() {
  try {
    const auth = await getAuth();
    if (!auth) return fail(401, 'Sign in to continue.');

    const customerId = auth.subscription?.stripeCustomerId;
    if (!customerId) {
      return fail(400, 'There is no billing account to manage yet.', {
        code: 'no_customer',
      });
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${env.APP_URL}/dashboard/billing`,
    });

    return ok({ url: session.url });
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      return fail(503, error.message, { code: 'billing_not_configured' });
    }
    return handleApiError(error, 'billing/portal');
  }
}

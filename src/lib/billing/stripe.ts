import 'server-only';

import Stripe from 'stripe';

import { env } from '@/lib/env';
import type { Plan } from '@/lib/db/schema';

/**
 * Stripe access.
 *
 * Billing is only considered configured when BOTH a secret key and a webhook
 * signing secret are present. A key without a webhook secret is worse than no
 * billing at all: checkout would succeed and the subscription would never be
 * recorded, so the customer pays and gets nothing.
 */

export class BillingNotConfiguredError extends Error {
  constructor() {
    super(
      'Billing is not configured on this deployment. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
    );
    this.name = 'BillingNotConfiguredError';
  }
}

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.stripe.enabled || !env.stripe.secretKey) {
    throw new BillingNotConfiguredError();
  }
  cached ??= new Stripe(env.stripe.secretKey, {
    // Pinned. An unpinned version means Stripe can change the webhook payload
    // shape under a running deployment.
    apiVersion: '2026-08-26.dahlia',
    typescript: true,
    maxNetworkRetries: 2,
  });
  return cached;
}

export function priceIdFor(plan: Exclude<Plan, 'free'>): string {
  const priceId =
    plan === 'pro' ? env.stripe.priceIdPro : env.stripe.priceIdAgency;
  if (!priceId) {
    throw new BillingNotConfiguredError();
  }
  return priceId;
}

/** Maps a configured price id back to the plan it grants. */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === env.stripe.priceIdPro) return 'pro';
  if (priceId === env.stripe.priceIdAgency) return 'agency';
  return null;
}

/**
 * Honest description of the billing state, surfaced in the UI. The product
 * must never imply live payments are being taken when they are not.
 */
export function billingStatus(): {
  configured: boolean;
  mode: 'live' | 'test' | 'disabled';
  message: string;
} {
  if (!env.stripe.enabled) {
    return {
      configured: false,
      mode: 'disabled',
      message:
        'Billing is not connected on this deployment. Plans and limits work, but no payment can be taken.',
    };
  }
  return env.stripe.isLiveMode
    ? { configured: true, mode: 'live', message: 'Payments are live.' }
    : {
        configured: true,
        mode: 'test',
        message:
          'Stripe is in test mode. Checkout works end to end with test cards, and no real money moves.',
      };
}

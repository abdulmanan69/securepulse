import type { Plan, ScanFrequency } from '@/lib/db/schema';

/**
 * Plan definitions. Single source of truth for pricing, limits and features.
 *
 * Every limit is enforced server-side in src/lib/billing/usage.ts. Nothing here
 * is used to gate the UI only: hiding a button is a presentation choice, not a
 * limit, and a customer who calls the endpoint directly must still be stopped.
 */

export interface PlanDefinition {
  id: Plan;
  name: string;
  /** Monthly price in the smallest currency unit (cents). */
  priceCents: number;
  currency: 'usd';
  tagline: string;
  maxDomains: number;
  /** Scans allowed per billing period, across all domains. */
  scansPerPeriod: number;
  allowedFrequencies: ScanFrequency[];
  features: string[];
  /** Ownership-verified domains unlock exposed-file discovery. */
  exposedFileDiscovery: boolean;
  /** AI-written remediation summary on reports. */
  aiSummary: boolean;
  /** Client-ready printable report. */
  pdfReports: boolean;
  /** Removes SecurePulse branding from shared reports. */
  whiteLabel: boolean;
  emailAlerts: boolean;
  /** Read-only API access for embedding results elsewhere. */
  apiAccess: boolean;
}

export const PLANS: Record<Plan, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceCents: 0,
    currency: 'usd',
    tagline: 'Check one site and see exactly what the paid plans monitor.',
    maxDomains: 1,
    scansPerPeriod: 5,
    allowedFrequencies: ['manual'],
    features: [
      '1 domain',
      '5 scans per month',
      'Full 12-point report',
      'Scan history',
    ],
    exposedFileDiscovery: false,
    aiSummary: false,
    pdfReports: false,
    whiteLabel: false,
    emailAlerts: false,
    apiAccess: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 1900,
    currency: 'usd',
    tagline: 'Continuous monitoring for the sites you are responsible for.',
    maxDomains: 5,
    scansPerPeriod: 150,
    allowedFrequencies: ['manual', 'weekly', 'daily'],
    features: [
      '5 domains',
      '150 scans per month',
      'Daily or weekly automatic scans',
      'Email alert when a grade drops',
      'Exposed file detection on verified domains',
      'Plain-English fix guidance',
      'Printable client reports',
    ],
    exposedFileDiscovery: true,
    aiSummary: true,
    pdfReports: true,
    whiteLabel: false,
    emailAlerts: true,
    apiAccess: false,
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    priceCents: 4900,
    currency: 'usd',
    tagline: 'Monitor every client site and hand them a report with your name on it.',
    maxDomains: 25,
    scansPerPeriod: 750,
    allowedFrequencies: ['manual', 'weekly', 'daily'],
    features: [
      '25 domains',
      '750 scans per month',
      'Everything in Pro',
      'White-label reports',
      'Read-only API access',
      'Priority support',
    ],
    exposedFileDiscovery: true,
    aiSummary: true,
    pdfReports: true,
    whiteLabel: true,
    emailAlerts: true,
    apiAccess: true,
  },
};

export const PLAN_ORDER: Plan[] = ['free', 'pro', 'agency'];

export function planFor(plan: Plan): PlanDefinition {
  return PLANS[plan];
}

export function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(0)}`;
}

/** Plans a user can move to from their current one, for the upgrade UI. */
export function upgradeTargets(current: Plan): PlanDefinition[] {
  const index = PLAN_ORDER.indexOf(current);
  return PLAN_ORDER.slice(index + 1).map((id) => PLANS[id]);
}

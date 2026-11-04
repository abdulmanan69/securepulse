import 'server-only';

import { getDb } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';

/**
 * Append-only record of actions that matter.
 *
 * Two reasons this exists rather than being left to application logs. First,
 * a scanning service has to be able to answer "who asked us to scan this
 * domain, and when" if a site owner ever objects. Second, it is the evidence
 * trail for an account compromise.
 *
 * Writes are intentionally non-fatal: failing to record an audit line must
 * never take down the action it is describing.
 */
export async function recordAudit(entry: {
  userId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({
      userId: entry.userId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      ip: entry.ip ?? null,
      meta: entry.meta ?? null,
    });
  } catch (error) {
    console.error('[audit] failed to record entry', entry.action, error);
  }
}

export const AUDIT = {
  signup: 'user.signup',
  login: 'user.login',
  loginFailed: 'user.login_failed',
  logout: 'user.logout',
  passwordChanged: 'user.password_changed',
  passwordResetRequested: 'user.password_reset_requested',
  passwordReset: 'user.password_reset',
  accountUpdated: 'user.account_updated',
  domainAdded: 'domain.added',
  domainVerified: 'domain.verified',
  domainRemoved: 'domain.removed',
  scanStarted: 'scan.started',
  scanCompleted: 'scan.completed',
  scanFailed: 'scan.failed',
  publicScan: 'scan.public',
  apiKeyCreated: 'api_key.created',
  apiKeyRevoked: 'api_key.revoked',
  checkoutStarted: 'billing.checkout_started',
  subscriptionUpdated: 'billing.subscription_updated',
  subscriptionCanceled: 'billing.subscription_canceled',
} as const;

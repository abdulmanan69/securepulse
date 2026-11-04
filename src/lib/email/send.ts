import 'server-only';

import { getDb } from '@/lib/db';
import { emails } from '@/lib/db/schema';
import { env } from '@/lib/env';

/**
 * Transactional email.
 *
 * Every message is written to the `emails` table before dispatch, whether or
 * not a provider is configured. That gives three things: a dev inbox you can
 * query with no API key, an audit trail of what was actually sent to a
 * customer, and tests that assert on email behaviour without mocking a network
 * client.
 *
 * With no RESEND_API_KEY the message is recorded and logged, and nothing is
 * transmitted. Nothing in the app pretends otherwise.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  template: string;
  body: string;
  userId?: string | null;
}

export async function sendEmail(message: EmailMessage): Promise<{
  delivered: boolean;
  provider: string;
  error?: string;
}> {
  const db = await getDb();
  const provider = env.email.enabled ? 'resend' : 'logged';

  let providerMessageId: string | null = null;
  let error: string | null = null;

  if (env.email.enabled) {
    try {
      const { Resend } = await import('resend');
      const client = new Resend(env.email.resendApiKey);
      const result = await client.emails.send({
        from: env.email.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
      if (result.error) {
        error = result.error.message;
      } else {
        providerMessageId = result.data?.id ?? null;
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  } else {
    console.info(
      `[email:not-sent] no provider configured. To: ${message.to} | ${message.subject}`,
    );
  }

  await db.insert(emails).values({
    userId: message.userId ?? null,
    to: message.to,
    subject: message.subject,
    template: message.template,
    body: message.body,
    provider,
    providerMessageId,
    error,
  });

  return { delivered: !error && env.email.enabled, provider, error: error ?? undefined };
}

export async function sendWelcomeEmail(
  userId: string,
  to: string,
  name: string | null,
) {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return sendEmail({
    userId,
    to,
    template: 'welcome',
    subject: 'Welcome to SecurePulse',
    body: `${greeting}

Your SecurePulse account is ready.

Here is the fastest way to get value out of it:

1. Add your domain at ${env.APP_URL}/dashboard/sites
2. Run your first scan. It takes a few seconds and checks 12 things across
   encryption, security headers, cookies, page content and email DNS.
3. Verify the domain with a DNS TXT record. That unlocks checks for
   accidentally published files such as .env and .git, which we only run on
   domains you have proven you control.

A site's security posture decays quietly. Certificates expire, headers get
dropped in a redeploy, DNS records drift. That is the whole reason this runs on
a schedule rather than once.

Reply to this email if anything is unclear.

SecurePulse
${env.APP_URL}`,
  });
}

export async function sendGradeDropEmail(params: {
  userId: string;
  to: string;
  hostname: string;
  previousGrade: string;
  newGrade: string;
  newScore: number;
  topIssues: string[];
  scanId: string;
}) {
  return sendEmail({
    userId: params.userId,
    to: params.to,
    template: 'grade_drop',
    subject: `${params.hostname} dropped from ${params.previousGrade} to ${params.newGrade}`,
    body: `The security grade for ${params.hostname} has dropped.

  Previous grade: ${params.previousGrade}
  Current grade:  ${params.newGrade} (${params.newScore}/100)

What changed:
${params.topIssues.map((issue) => `  - ${issue}`).join('\n')}

Full report: ${env.APP_URL}/dashboard/scans/${params.scanId}

This usually follows a deploy or a DNS change. If that was expected, the fix is
normally to restore a header or a redirect that was dropped.

SecurePulse`,
  });
}

export async function sendUsageWarningEmail(params: {
  userId: string;
  to: string;
  scansUsed: number;
  scansLimit: number;
  planName: string;
}) {
  return sendEmail({
    userId: params.userId,
    to: params.to,
    template: 'usage_warning',
    subject: `You have used ${params.scansUsed} of ${params.scansLimit} scans`,
    body: `You have used ${params.scansUsed} of the ${params.scansLimit} scans included in your ${params.planName} plan this period.

When the allowance runs out, scheduled scans pause until the period resets. If
you are monitoring more sites than the plan covers, upgrading takes a minute:

${env.APP_URL}/pricing

SecurePulse`,
  });
}

export async function sendCertificateExpiryEmail(params: {
  userId: string;
  to: string;
  hostname: string;
  daysUntilExpiry: number;
}) {
  return sendEmail({
    userId: params.userId,
    to: params.to,
    template: 'cert_expiry',
    subject: `${params.hostname}: certificate expires in ${params.daysUntilExpiry} days`,
    body: `The TLS certificate for ${params.hostname} expires in ${params.daysUntilExpiry} days.

When it lapses, every visitor gets a full-page browser warning before they can
reach the site. Most of them leave at that screen.

If renewal is automated, confirm the last renewal actually ran. If it is manual,
this is the reminder.

${env.APP_URL}/dashboard

SecurePulse`,
  });
}

export async function sendPasswordResetEmail(params: {
  userId: string;
  to: string;
  name: string | null;
  url: string;
}) {
  const greeting = params.name ? `Hi ${params.name},` : 'Hi,';
  return sendEmail({
    userId: params.userId,
    to: params.to,
    template: 'password_reset',
    subject: 'Reset your SecurePulse password',
    body: `${greeting}

Someone asked to reset the password for this SecurePulse account. If that was
you, use the link below. It works once and expires in one hour.

${params.url}

If it was not you, you can ignore this email. Your password has not changed,
and nobody can use this link without access to this inbox.

SecurePulse
${env.APP_URL}`,
  });
}

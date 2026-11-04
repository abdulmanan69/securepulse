import { count, desc, eq } from 'drizzle-orm';
import Link from 'next/link';

import { EmptyState } from '@/components/stat-tile';
import { getAuth } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { auditLog, emails } from '@/lib/db/schema';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const metadata = { title: 'Activity' };

const PAGE_SIZE = 40;

/** Human wording for each audit action. */
const ACTION_LABELS: Record<string, string> = {
  'user.signup': 'Account created',
  'user.login': 'Signed in',
  'user.login_failed': 'Failed sign-in attempt',
  'user.logout': 'Signed out',
  'user.password_changed': 'Password changed',
  'domain.added': 'Site added',
  'domain.verified': 'Ownership verified',
  'domain.removed': 'Site removed',
  'scan.started': 'Scan started',
  'scan.completed': 'Scan completed',
  'scan.failed': 'Scan failed',
  'scan.public': 'Public scan',
  'api_key.created': 'API key created',
  'api_key.revoked': 'API key revoked',
  'user.account_updated': 'Profile updated',
  'user.deleted': 'Account deleted',
  'billing.checkout_started': 'Checkout started',
  'billing.subscription_updated': 'Subscription updated',
  'billing.subscription_canceled': 'Subscription canceled',
};

function summarise(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const parts: string[] = [];
  if (typeof meta.hostname === 'string') parts.push(meta.hostname);
  if (typeof meta.grade === 'string') parts.push(`grade ${meta.grade}`);
  if (typeof meta.plan === 'string') parts.push(`plan ${meta.plan}`);
  if (typeof meta.status === 'string') parts.push(String(meta.status));
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default async function ActivityPage({
  searchParams,
}: PageProps<'/dashboard/activity'>) {
  const auth = await getAuth();
  if (!auth) return null;

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const tab = params.tab === 'email' ? 'email' : 'activity';

  const db = await getDb();

  const [entries, [totals], messages] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, auth.user.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(auditLog)
      .where(eq(auditLog.userId, auth.user.id)),
    db
      .select()
      .from(emails)
      .where(eq(emails.userId, auth.user.id))
      .orderBy(desc(emails.createdAt))
      .limit(30),
  ]);

  const total = totals?.value ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-extrabold">Activity</h1>
        <p className="mt-0.5 max-w-[68ch] text-[13.5px] text-slate">
          Everything this account has done, and every message we have sent it.
          Scans are recorded with their source so we can always answer who
          asked us to scan a domain.
        </p>
      </div>

      <div className="mb-4 flex gap-1.5">
        <Link
          href="/dashboard/activity"
          className={`inline-flex h-7 items-center rounded-sm border px-2.5 text-[12px] transition-colors ${
            tab === 'activity'
              ? 'border-ink bg-ink text-paper'
              : 'border-rule-strong bg-surface text-slate hover:border-ink hover:text-ink'
          }`}
        >
          Audit log
          <span className="ml-1.5 font-mono text-[10.5px] opacity-70">{total}</span>
        </Link>
        <Link
          href="/dashboard/activity?tab=email"
          className={`inline-flex h-7 items-center rounded-sm border px-2.5 text-[12px] transition-colors ${
            tab === 'email'
              ? 'border-ink bg-ink text-paper'
              : 'border-rule-strong bg-surface text-slate hover:border-ink hover:text-ink'
          }`}
        >
          Email
          <span className="ml-1.5 font-mono text-[10.5px] opacity-70">
            {messages.length}
          </span>
        </Link>
      </div>

      {tab === 'email' ? (
        <section>
          {!env.email.enabled ? (
            <div className="mb-4 border border-caution/30 bg-caution-soft px-4 py-3 text-[13px] leading-relaxed text-caution">
              No email provider is configured on this deployment, so these
              messages were recorded but not transmitted. The full body of each
              is shown below.
            </div>
          ) : null}

          {messages.length === 0 ? (
            <EmptyState
              title="No email yet"
              body="Welcome mail, grade-drop alerts and certificate expiry warnings all appear here."
            />
          ) : (
            <ul className="divide-y divide-rule border border-rule bg-surface">
              {messages.map((message) => (
                <li key={message.id} className="p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <p className="text-[14px] font-semibold">{message.subject}</p>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-slate">
                      {message.template}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-slate">
                      {new Date(message.createdAt).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11.5px] text-slate">
                    to {message.to} ·{' '}
                    <span
                      className={
                        message.error
                          ? 'text-alert'
                          : message.provider === 'logged'
                            ? 'text-caution'
                            : 'text-pass'
                      }
                    >
                      {message.error
                        ? `failed: ${message.error}`
                        : message.provider === 'logged'
                          ? 'recorded, not sent'
                          : 'sent'}
                    </span>
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12.5px] text-signal">
                      Show message
                    </summary>
                    <pre className="mt-2 overflow-x-auto border border-rule bg-paper p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
                      {message.body}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : entries.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          body="Sign-ins, site changes and scans all appear here as they happen."
        />
      ) : (
        <>
          <ol className="divide-y divide-rule border border-rule bg-surface">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    entry.action.includes('failed')
                      ? 'bg-alert'
                      : entry.action.startsWith('billing')
                        ? 'bg-signal'
                        : 'bg-rule-strong'
                  }`}
                />
                <span className="text-[13.5px]">
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </span>
                {summarise(entry.meta) ? (
                  <span className="font-mono text-[11.5px] text-slate">
                    {summarise(entry.meta)}
                  </span>
                ) : null}
                <span className="ml-auto flex shrink-0 items-baseline gap-3 font-mono text-[11px] text-slate">
                  {entry.ip && entry.ip !== 'unknown' ? <span>{entry.ip}</span> : null}
                  <time dateTime={entry.createdAt.toISOString()}>
                    {new Date(entry.createdAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </span>
              </li>
            ))}
          </ol>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <p className="font-mono text-[12px] text-slate">
                Page {page} of {pages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={`/dashboard/activity?page=${page - 1}`}
                    className="inline-flex h-8 items-center rounded-sm border border-rule-strong bg-surface px-3 text-[13px] hover:border-ink"
                  >
                    Previous
                  </Link>
                ) : null}
                {page < pages ? (
                  <Link
                    href={`/dashboard/activity?page=${page + 1}`}
                    className="inline-flex h-8 items-center rounded-sm border border-rule-strong bg-surface px-3 text-[13px] hover:border-ink"
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

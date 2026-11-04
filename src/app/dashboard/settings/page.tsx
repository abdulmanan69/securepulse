import Link from 'next/link';

import {
  DeleteAccountForm,
  PasswordForm,
  ProfileForm,
} from '@/components/account-forms';
import { ApiKeysPanel } from '@/components/api-keys-panel';
import { listApiKeys } from '@/lib/api-keys';
import { SectionHeader } from '@/components/stat-tile';
import { getAuth } from '@/lib/auth/session';
import { planFor } from '@/lib/billing/plans';
import { getDb } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { count, eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const auth = await getAuth();
  if (!auth) return null;

  const db = await getDb();
  const apiKeyRows = await listApiKeys(auth.user.id);
  const [sessionCount] = await db
    .select({ value: count() })
    .from(sessions)
    .where(eq(sessions.userId, auth.user.id));

  const plan = planFor(auth.plan);

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-extrabold">Settings</h1>
        <p className="mt-0.5 text-[13.5px] text-slate">
          Member since{' '}
          {new Date(auth.user.createdAt).toLocaleDateString('en-US', {
            dateStyle: 'long',
          })}{' '}
          · {plan.name} plan ·{' '}
          <Link href="/dashboard/billing" className="text-signal hover:underline">
            manage billing
          </Link>
        </p>
      </div>

      <section className="mb-10">
        <SectionHeader title="Profile" />
        <div className="border border-rule bg-surface p-5">
          <ProfileForm email={auth.user.email} name={auth.user.name} />
        </div>
      </section>

      <section className="mb-10">
        <SectionHeader
          title="Password"
          description={`Changing it signs out every other session. You currently have ${sessionCount?.value ?? 1} active session${(sessionCount?.value ?? 1) === 1 ? '' : 's'}.`}
        />
        <div className="border border-rule bg-surface p-5">
          <PasswordForm />
        </div>
      </section>

      <section className="mb-10">
        <SectionHeader
          title="Notifications"
          description="Alerts are configured per site, because you rarely want the same cadence for a client site and your own."
        />
        <div className="border border-rule bg-surface p-5">
          <p className="text-[13.5px] leading-relaxed text-slate">
            {plan.emailAlerts
              ? 'Your plan includes email alerts. Turn them on or off for each site from its page under Sites.'
              : 'Email alerts are part of the Pro plan. On the Free plan scans run only when you start them, so there is nothing to alert on.'}
          </p>
          <Link
            href="/dashboard/sites"
            className="mt-3 inline-block text-[13px] font-medium text-signal hover:underline"
          >
            Go to Sites →
          </Link>
        </div>
      </section>

      <section className="mb-10">
        <SectionHeader
          title="API access"
          description="Read-only access to your sites, scan history and findings."
        />
        <ApiKeysPanel
          enabled={plan.apiAccess}
          initialKeys={apiKeyRows.map((key) => ({
            id: key.id,
            name: key.name,
            prefix: key.prefix,
            lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
            revokedAt: key.revokedAt?.toISOString() ?? null,
            createdAt: key.createdAt.toISOString(),
          }))}
        />
      </section>

      <section>
        <SectionHeader title="Danger zone" />
        <div className="border border-alert/25 bg-surface p-5">
          <p className="mb-4 max-w-[62ch] text-[13.5px] leading-relaxed text-slate">
            Deleting your account removes every site, scan and report
            immediately and permanently. If you have an active subscription,
            cancel it in the billing portal first.
          </p>
          <DeleteAccountForm email={auth.user.email} />
        </div>
      </section>
    </div>
  );
}

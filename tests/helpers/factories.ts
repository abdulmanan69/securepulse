import { hashPassword } from '@/lib/auth/password';
import { getDb } from '@/lib/db';
import { domains, scans, subscriptions, users } from '@/lib/db/schema';
import type { Plan, Subscription } from '@/lib/db/schema';
import { generateVerificationToken } from '@/lib/domains';

/** Test fixtures. Everything here is synthetic; nothing touches a real service. */

let counter = 0;

export async function createUser(overrides: { email?: string } = {}) {
  const db = await getDb();
  counter += 1;
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user${counter}@example-test.com`,
      passwordHash: await hashPassword('correct horse battery staple'),
      name: `Test User ${counter}`,
    })
    .returning();

  const [subscription] = await db
    .insert(subscriptions)
    .values({ userId: user.id, plan: 'free', status: 'active' })
    .returning();

  return { user, subscription };
}

export async function setPlan(
  userId: string,
  plan: Plan,
  overrides: Partial<Subscription> = {},
): Promise<Subscription> {
  const db = await getDb();
  const { eq } = await import('drizzle-orm');
  const [updated] = await db
    .update(subscriptions)
    .set({
      plan,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      ...overrides,
    })
    .where(eq(subscriptions.userId, userId))
    .returning();
  return updated;
}

export async function createDomain(
  userId: string,
  hostname: string,
  overrides: Partial<typeof domains.$inferInsert> = {},
) {
  const db = await getDb();
  const [domain] = await db
    .insert(domains)
    .values({
      userId,
      hostname,
      verificationToken: generateVerificationToken(),
      ...overrides,
    })
    .returning();
  return domain;
}

/** Records a completed scan without performing any network activity. */
export async function recordScan(
  userId: string,
  domainId: string | null,
  hostname: string,
  overrides: Partial<typeof scans.$inferInsert> = {},
) {
  const db = await getDb();
  const [scan] = await db
    .insert(scans)
    .values({
      userId,
      domainId,
      hostname,
      status: 'complete',
      grade: 'B',
      score: 85,
      ...overrides,
    })
    .returning();
  return scan;
}

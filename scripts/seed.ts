/**
 * Creates a development account so you can see a populated dashboard without
 * clicking through signup every time you reset the database.
 *
 *   npm run seed
 *
 * It seeds an account and a domain only. It does NOT fabricate scan results:
 * run a real scan from the dashboard and you get real findings against a real
 * site. Invented grades in a demo are how a product ends up shipping a
 * scanner nobody ever actually pointed at the internet.
 *
 * Like scripts/migrate.ts, this opens its own connection rather than importing
 * src/lib/db. That module is marked `server-only`, which by design refuses to
 * load outside the Next.js bundler.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

import { eq } from 'drizzle-orm';

import { hashPassword } from '../src/lib/auth/password';
import { domains, subscriptions, users } from '../src/lib/db/schema';

const DEMO_EMAIL = 'demo@securepulse.local';
const DEMO_PASSWORD = 'correct horse battery staple';

async function connect() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const sql = postgres(databaseUrl, { max: 1 });
    return { db: drizzle(sql), close: () => sql.end({ timeout: 5 }) };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const dataDir = process.env.PGLITE_DATA_DIR ?? '.data/pg';
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await client.waitReady;
  return { db: drizzle(client), close: () => client.close() };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed a production environment.');
    process.exit(1);
  }

  const { db, close } = await connect();

  try {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DEMO_EMAIL))
      .limit(1);

    if (existing.length > 0) {
      console.log(`Demo account already exists: ${DEMO_EMAIL}`);
      return;
    }

    const [user] = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        name: 'Demo Account',
      })
      .returning();

    // Pro, so the seeded account exercises scheduling, alerts and the written
    // summary without needing a Stripe checkout in development.
    await db.insert(subscriptions).values({
      userId: user.id,
      plan: 'pro',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // A real, public domain so the first scan produces genuine findings.
    await db.insert(domains).values({
      userId: user.id,
      hostname: 'example.com',
      label: 'Example (scan it to see real findings)',
      verificationToken: randomBytes(16).toString('hex'),
    });

    console.log('Seeded development account:');
    console.log(`  email:    ${DEMO_EMAIL}`);
    console.log(`  password: ${DEMO_PASSWORD}`);
    console.log('  plan:     pro');
    console.log('\nSign in and press "Scan now" to produce a real report.');
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});

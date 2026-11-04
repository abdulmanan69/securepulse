/**
 * Applies every pending SQL migration in ./drizzle.
 *
 * Works against whichever driver the environment selects, so the exact same
 * migration files are used locally (PGlite) and in production (Postgres).
 *
 *   npm run db:migrate
 */
import 'dotenv/config';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

async function main() {
  if (!existsSync(MIGRATIONS_FOLDER)) {
    throw new Error(
      `No migrations folder at ${MIGRATIONS_FOLDER}. Run "npm run db:generate" first.`,
    );
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');

    // A migration must run on a single dedicated connection.
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
      console.log('Migrations applied (postgres-js).');
    } finally {
      await sql.end({ timeout: 5 });
    }
    return;
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const dataDir = process.env.PGLITE_DATA_DIR ?? '.data/pg';
  // PGlite's node filesystem layer calls a non-recursive mkdir, so it fails if
  // the parent directory is missing on a fresh checkout. Create it ourselves.
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await client.waitReady;
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log(`Migrations applied (PGlite at ${dataDir}).`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});

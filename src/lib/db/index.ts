import 'server-only';

import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { env } from '@/lib/env';
import * as schema from './schema';

/**
 * The application talks to exactly one Postgres dialect. Which driver gets us
 * there depends on the environment:
 *
 *   - DATABASE_URL set   -> postgres.js against a real server (Neon, Supabase,
 *                           Docker, anything).
 *   - DATABASE_URL unset -> PGlite, which is Postgres compiled to WASM running
 *                           in-process against a local directory.
 *
 * PGlite exists so that `npm run dev` and `npm test` work on a clean checkout
 * with no database to install and no credentials to obtain. It is real
 * Postgres, so the same migrations and the same SQL run in both modes and
 * there is no dev/prod dialect drift.
 *
 * Both drivers expose the identical Drizzle query-builder surface, so the rest
 * of the codebase is written against a single type.
 */
export type Db = PostgresJsDatabase<typeof schema>;

type DbHandle = {
  db: Db;
  driver: 'pglite' | 'postgres-js';
  /** Releases the underlying connection. Only used by tests and scripts. */
  close: () => Promise<void>;
};

// Next.js dev-mode hot reload re-evaluates modules. Without a global cache we
// would open a new PGlite instance, and a new file lock, on every edit.
const globalForDb = globalThis as unknown as {
  __securepulseDb?: Promise<DbHandle>;
};

async function createHandle(): Promise<DbHandle> {
  if (env.DATABASE_URL) {
    const { default: postgres } = await import('postgres');
    const sql = postgres(env.DATABASE_URL, {
      // Serverless functions are short-lived; a large pool just exhausts the
      // server connection slots. Neon/Supabase poolers handle the fan-out.
      max: env.isProd ? 5 : 2,
      idle_timeout: 20,
      connect_timeout: 15,
    });
    return {
      db: drizzlePostgres(sql, { schema }),
      driver: 'postgres-js',
      close: () => sql.end({ timeout: 5 }),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  // memory:// keeps test runs isolated and fast; dev persists to disk so a
  // restart does not wipe the account you just created.
  const dataDir = env.isTest ? 'memory://' : env.PGLITE_DATA_DIR;
  if (dataDir !== 'memory://') {
    // PGlite's node filesystem layer uses a non-recursive mkdir, so a missing
    // parent directory on a fresh checkout throws ENOENT. Create it first.
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dataDir, { recursive: true });
  }
  const client = new PGlite(dataDir);
  await client.waitReady;

  return {
    // Identical query-builder surface; the cast keeps one Db type across the
    // codebase instead of leaking a union into every call site.
    db: drizzlePglite(client, { schema }) as unknown as Db,
    driver: 'pglite',
    close: () => client.close(),
  };
}

export function getDbHandle(): Promise<DbHandle> {
  globalForDb.__securepulseDb ??= createHandle();
  return globalForDb.__securepulseDb;
}

/** Primary accessor. Every query in the app goes through this. */
export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}

export async function closeDb(): Promise<void> {
  const existing = globalForDb.__securepulseDb;
  if (!existing) return;
  globalForDb.__securepulseDb = undefined;
  await (await existing).close();
}

export { schema };

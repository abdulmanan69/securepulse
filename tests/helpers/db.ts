import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { sql } from 'drizzle-orm';

import { getDb } from '@/lib/db';

/**
 * Builds the schema inside the test database by replaying the real migration
 * files. Tests therefore exercise the same DDL that production runs, so a
 * broken migration fails the suite instead of failing a deploy.
 */
export async function applyMigrations(): Promise<void> {
  const db = await getDb();
  const folder = path.join(process.cwd(), 'drizzle');
  const files = readdirSync(folder)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const contents = readFileSync(path.join(folder, file), 'utf8');
    // drizzle-kit separates statements with this sentinel comment.
    const statements = contents
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }
  }
}

/**
 * Child tables first so foreign keys never block the clear. Listed explicitly
 * rather than discovered, so adding a table to the schema and forgetting to
 * clear it shows up as a test that leaks state.
 */
const TABLES_CHILD_FIRST = [
  'findings',
  'password_resets',
  'api_keys',
  'scans',
  'domains',
  'subscriptions',
  'sessions',
  'emails',
  'audit_log',
  'rate_limits',
  'users',
];

/**
 * Empties every table between tests. Only ever reaches the in-memory PGlite
 * instance, because tests/setup.ts unsets DATABASE_URL before anything
 * connects.
 */
export async function clearAllTables(): Promise<void> {
  const db = await getDb();
  for (const table of TABLES_CHILD_FIRST) {
    await db.execute(sql.raw(`DELETE FROM "${table}"`));
  }
}

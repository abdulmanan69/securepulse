import type { Config } from 'drizzle-kit';

/**
 * Only used by `drizzle-kit generate` to emit SQL migrations from the schema.
 * Migrations are applied by scripts/migrate.ts, which picks the right driver
 * (PGlite or postgres.js) at runtime. drizzle-kit never connects here.
 */
export default {
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
} satisfies Config;

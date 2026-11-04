/**
 * Drops the local development database and rebuilds it from the migrations.
 *
 *   npm run db:reset
 *
 * Refuses to run against a real DATABASE_URL. Rebuilding a throwaway local
 * PGlite directory is routine; doing it to a Postgres server someone has
 * pointed at production is not, and a script cannot tell the difference from
 * the connection string alone.
 */
import 'dotenv/config';
import { rmSync } from 'node:fs';
import path from 'node:path';

async function main() {
  if (process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL is set. This script only resets the local PGlite database.\n' +
        'To rebuild a real database, run your migrations against it deliberately.',
    );
    process.exit(1);
  }

  const dataDir = path.resolve(
    process.cwd(),
    process.env.PGLITE_DATA_DIR ?? '.data/pg',
  );
  const projectRoot = process.cwd();

  // Refuse to remove anything outside the project directory.
  if (!dataDir.startsWith(projectRoot)) {
    console.error(`Refusing to remove ${dataDir}: it is outside the project.`);
    process.exit(1);
  }

  rmSync(dataDir, { recursive: true, force: true });
  console.log(`Removed ${dataDir}`);

  // Re-run the migration script in-process so the rebuild uses exactly the
  // same code path as a normal migration.
  await import('./migrate');
}

main().catch((error) => {
  console.error('Reset failed:', error);
  process.exit(1);
});

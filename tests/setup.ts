import { afterAll, beforeAll } from 'vitest';

import { closeDb } from '@/lib/db';
import { applyMigrations } from './helpers/db';

/**
 * Environment values live in vitest.config.mts under `test.env`, not here.
 * ES module imports are hoisted, so anything assigned in this file runs after
 * src/lib/env.ts has already been evaluated by the imports above.
 */

beforeAll(async () => {
  await applyMigrations();
});

afterAll(async () => {
  await closeDb();
});

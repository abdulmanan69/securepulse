import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    /**
     * Set before any module is imported.
     *
     * This cannot live in setup.ts: ES module imports are hoisted, so
     * src/lib/env.ts would be evaluated before any assignment in that file
     * ran, and the app would see an unconfigured environment.
     *
     * Every value is obviously fake. An empty DATABASE_URL forces the
     * in-memory PGlite path, so a developer with a real database exported in
     * their shell cannot have it touched by the suite.
     */
    env: {
      DATABASE_URL: '',
      APP_SECRET: 'test-secret-not-used-anywhere-real',
      CRON_SECRET: 'test-cron-secret',
      APP_URL: 'http://localhost:3000',
      STRIPE_SECRET_KEY: 'sk_test_securepulse_dummy_key',
      STRIPE_WEBHOOK_SECRET: 'whsec_securepulse_dummy_secret',
      STRIPE_PRICE_ID_PRO: 'price_test_pro',
      STRIPE_PRICE_ID_AGENCY: 'price_test_agency',
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Suites under tests/live reach the real internet. They are gated on the
    // LIVE env var inside the files themselves rather than excluded here, so
    // they can be run on demand without a second config.
    exclude: ['node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
      // `server-only` throws by design outside a Next.js bundle. It exists to
      // fail the *build* if a server module is pulled into a client bundle,
      // which is exactly the guarantee we want in the app. Under Vitest there
      // is no client bundle, so it is stubbed rather than removed from source.
      'server-only': path.resolve(rootDir, 'tests/stubs/server-only.ts'),
    },
  },
});

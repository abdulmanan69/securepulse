import { describe, it } from 'vitest';

import { runScan } from '@/lib/scanner/engine';
import { evaluate } from '@/lib/scanner/engine';

/**
 * Not an assertion suite. Prints a full report for a handful of real sites so
 * the wording and the grading can be reviewed by eye.
 *   LIVE=1 npx vitest run tests/live/report-sample.test.ts --silent=false
 */
const live = process.env.LIVE ? describe : describe.skip;

live('sample reports', () => {
  it('prints reports for a spread of real sites', async () => {
    for (const host of ['github.com', 'example.com', 'neverssl.com']) {
      try {
        const result = await runScan(host);
        const scored = evaluate(result.evidence);
        process.stdout.write(
          `\n===== ${host}: ${result.grade} (${result.score}/100) in ${result.durationMs}ms =====\n`,
        );
        for (const c of scored.categories) {
          process.stdout.write(
            `  [${c.label}] ${c.earned}/${c.possible}\n`,
          );
        }
        for (const f of result.findings) {
          process.stdout.write(
            `  ${f.status.toUpperCase().padEnd(4)} ${f.checkId.padEnd(34)} ${f.title}\n`,
          );
        }
      } catch (error) {
        process.stdout.write(`\n===== ${host}: ERROR ${String(error)}\n`);
      }
    }
  }, 120_000);
});

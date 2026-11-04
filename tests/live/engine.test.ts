import { describe, expect, it } from 'vitest';

import { runScan } from '@/lib/scanner/engine';

/**
 * End-to-end scans against real sites. Opt-in:  LIVE=1 npx vitest run tests/live
 *
 * Assertions are properties that must hold for any real scan, not a snapshot
 * of one site on one day, so these do not go stale when a site changes.
 */
const live = process.env.LIVE ? describe : describe.skip;

live('runScan end to end', () => {
  it('produces a complete, self-consistent report for a well-configured site', async () => {
    const result = await runScan('github.com');

    expect(result.hostname).toBe('github.com');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.grade).toMatch(/^(A\+|A|B|C|D|F)$/);

    // Every scored check must have reported, so the denominator is the full
    // 100 points regardless of what the site does.
    const possible = result.findings.reduce((s, f) => s + f.pointsPossible, 0);
    expect(possible).toBe(100);

    // A major site should clear a passing grade on transport at minimum.
    const cert = result.findings.find(
      (f) => f.checkId === 'transport.tls_certificate',
    );
    expect(cert?.status).toBe('pass');

    // Every finding must carry text a non-specialist can act on.
    for (const finding of result.findings) {
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.detail.length).toBeGreaterThan(20);
      expect(finding.pointsEarned).toBeLessThanOrEqual(finding.pointsPossible);
    }

    console.log(
      `github.com -> ${result.grade} (${result.score}) in ${result.durationMs}ms; ` +
        `${result.findings.filter((f) => f.status === 'pass').length} pass, ` +
        `${result.findings.filter((f) => f.status === 'warn').length} warn, ` +
        `${result.findings.filter((f) => f.status === 'fail').length} fail`,
    );
  });

  it('stays within its request budget', async () => {
    const result = await runScan('example.com', { maxRequests: 6 });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThan(30_000);
  });

  it('rejects an internal hostname before touching the network', async () => {
    await expect(runScan('router.local')).rejects.toThrow();
  });
});

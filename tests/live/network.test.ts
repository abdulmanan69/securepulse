import { describe, expect, it } from 'vitest';

import {
  RequestBudget,
  ScanBudgetExceededError,
  collectDns,
  inspectTls,
  probe,
  tryProbe,
} from '@/lib/scanner/fetcher';

/**
 * These reach the real internet, so they are opt-in:
 *
 *   LIVE=1 npx vitest run tests/live
 *
 * They exist to prove the network layer genuinely works against real servers.
 * Everything asserted here is a property that holds for any correctly
 * configured host, not a snapshot of one site on one day.
 */
const live = process.env.LIVE ? describe : describe.skip;

live('network layer against real hosts', () => {
  it('fetches headers and body over HTTPS', async () => {
    const budget = new RequestBudget(24);
    const result = await probe('https://example.com/', budget);

    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(400);
    expect(result.body.length).toBeGreaterThan(0);
    expect(Object.keys(result.headers).length).toBeGreaterThan(0);
    // Header names must be lower-cased for the checks to find them.
    for (const name of Object.keys(result.headers)) {
      expect(name).toBe(name.toLowerCase());
    }
    expect(budget.spent).toBeGreaterThan(0);
  });

  it('follows the HTTP to HTTPS upgrade and records the chain', async () => {
    const budget = new RequestBudget(24);
    const result = await probe('http://github.com/', budget);

    expect(result.finalUrl.startsWith('https://')).toBe(true);
    expect(result.redirectChain.length).toBeGreaterThan(0);
  });

  it('reads a real certificate and computes days to expiry', async () => {
    const info = await inspectTls('github.com');

    expect(info.error).toBeUndefined();
    expect(info.authorized).toBe(true);
    expect(info.protocol).toMatch(/^TLSv1\.[23]$/);
    expect(info.issuer).toBeTruthy();
    expect(info.daysUntilExpiry).not.toBeNull();
    expect(info.daysUntilExpiry as number).toBeGreaterThan(0);
    expect(info.altNames.length).toBeGreaterThan(0);
  });

  it('reports an expired certificate as unauthorized rather than failing', async () => {
    const info = await inspectTls('expired.badssl.com');

    // The handshake still completes so we can describe the problem.
    expect(info.authorized).toBe(false);
    expect(info.authorizationError).toBeTruthy();
    expect(info.daysUntilExpiry as number).toBeLessThan(0);
  });

  it('refuses to connect to a host that resolves to loopback', async () => {
    // Public DNS name that resolves to loopback. The guarded lookup must
    // reject it at connect time, which is what stops DNS rebinding.
    const budget = new RequestBudget(24);
    const result = await tryProbe('https://localtest.me/', budget);
    expect(result).toBeNull();
  });

  it('enforces the request budget', async () => {
    const budget = new RequestBudget(1);
    await probe('https://example.com/', budget);
    await expect(probe('https://example.com/', budget)).rejects.toBeInstanceOf(
      ScanBudgetExceededError,
    );
  });

  it('collects DNS records including DMARC', async () => {
    const records = await collectDns('github.com');

    expect(records.a.length + records.aaaa.length).toBeGreaterThan(0);
    expect(records.mx.length).toBeGreaterThan(0);
    expect(records.txt.some((r) => r.startsWith('v=spf1'))).toBe(true);
    expect(records.dmarc.some((r) => r.startsWith('v=DMARC1'))).toBe(true);
  });
});

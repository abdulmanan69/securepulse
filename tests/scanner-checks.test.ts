import { describe, expect, it } from 'vitest';

import { contentChecks } from '@/lib/scanner/checks/content';
import { cookieChecks } from '@/lib/scanner/checks/cookies';
import { dnsChecks } from '@/lib/scanner/checks/dns';
import { exposureChecks } from '@/lib/scanner/checks/exposure';
import { headerChecks } from '@/lib/scanner/checks/headers';
import { transportChecks } from '@/lib/scanner/checks/transport';
import { evaluate } from '@/lib/scanner/engine';
import type { Finding } from '@/lib/scanner/types';
import { httpsProbe, perfectEvidence, tlsInfo } from './helpers/evidence';

const find = (findings: Finding[], id: string): Finding => {
  const match = findings.find((f) => f.checkId === id);
  if (!match) throw new Error(`No finding with checkId ${id}`);
  return match;
};

describe('transport checks', () => {
  it('fails a site served over HTTP with no upgrade', () => {
    const findings = transportChecks(
      perfectEvidence({
        http: httpsProbe({ finalUrl: 'http://example-site.com/', status: 200 }),
      }),
    );
    expect(find(findings, 'transport.https_redirect').status).toBe('fail');
  });

  it('treats HTTP not being served at all as correct', () => {
    const findings = transportChecks(perfectEvidence({ http: null }));
    expect(find(findings, 'transport.https_redirect').status).toBe('pass');
  });

  it('fails an untrusted certificate outright', () => {
    const findings = transportChecks(
      perfectEvidence({
        tls: tlsInfo({
          authorized: false,
          authorizationError: 'CERT_HAS_EXPIRED',
          daysUntilExpiry: -3,
        }),
      }),
    );
    const cert = find(findings, 'transport.tls_certificate');
    expect(cert.status).toBe('fail');
    expect(cert.severity).toBe('critical');
    expect(cert.pointsEarned).toBe(0);
  });

  it('warns before a certificate expires, and fails when it is imminent', () => {
    const soon = transportChecks(
      perfectEvidence({ tls: tlsInfo({ daysUntilExpiry: 25 }) }),
    );
    expect(find(soon, 'transport.tls_certificate').status).toBe('warn');

    const imminent = transportChecks(
      perfectEvidence({ tls: tlsInfo({ daysUntilExpiry: 5 }) }),
    );
    expect(find(imminent, 'transport.tls_certificate').status).toBe('fail');
  });

  it('fails obsolete TLS versions', () => {
    const findings = transportChecks(
      perfectEvidence({ tls: tlsInfo({ protocol: 'TLSv1' }) }),
    );
    expect(find(findings, 'transport.tls_version').status).toBe('fail');
  });
});

describe('header checks', () => {
  const withHeaders = (headers: Record<string, string>) =>
    headerChecks(perfectEvidence({ https: httpsProbe({ headers }) }));

  it('rejects an HSTS max-age too short to matter', () => {
    const findings = withHeaders({ 'strict-transport-security': 'max-age=600' });
    const hsts = find(findings, 'headers.hsts');
    expect(hsts.status).toBe('warn');
    expect(hsts.pointsEarned).toBeLessThan(hsts.pointsPossible);
  });

  it('does not award full marks for HSTS without includeSubDomains', () => {
    const findings = withHeaders({
      'strict-transport-security': 'max-age=31536000',
    });
    expect(find(findings, 'headers.hsts').status).toBe('warn');
  });

  it('treats a CSP built on unsafe-inline as weak, not as a pass', () => {
    const findings = withHeaders({
      'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'",
    });
    const csp = find(findings, 'headers.csp');
    expect(csp.status).toBe('warn');
    expect(csp.evidence?.weaknesses).toBeDefined();
  });

  it('accepts unsafe-inline when it is paired with a nonce', () => {
    const findings = withHeaders({
      'content-security-policy':
        "default-src 'self'; object-src 'none'; script-src 'nonce-abc123' 'unsafe-inline'",
    });
    expect(find(findings, 'headers.csp').status).toBe('pass');
  });

  it('reports report-only CSP as monitoring rather than protecting', () => {
    const findings = withHeaders({
      'content-security-policy-report-only': "default-src 'self'; object-src 'none'",
    });
    const csp = find(findings, 'headers.csp');
    expect(csp.status).toBe('warn');
    expect(csp.title).toMatch(/report-only/i);
  });

  it('accepts CSP frame-ancestors in place of X-Frame-Options', () => {
    const findings = withHeaders({
      'content-security-policy': "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
    });
    expect(find(findings, 'headers.frame_ancestors').status).toBe('pass');
  });

  it('scores every header as failed when the site does not respond', () => {
    const findings = headerChecks(perfectEvidence({ https: null }));
    expect(findings).toHaveLength(6);
    expect(findings.every((f) => f.pointsEarned === 0)).toBe(true);
    expect(findings.reduce((s, f) => s + f.pointsPossible, 0)).toBe(34);
  });
});

describe('content checks', () => {
  const withBody = (body: string) =>
    contentChecks(perfectEvidence({ https: httpsProbe({ body }) }));

  it('does not flag an ordinary outbound link as mixed content', () => {
    // Regression guard: matching on href alone reports a false positive on
    // almost every site, because plain links to http:// pages are not mixed
    // content. Only subresource loads count.
    const findings = withBody(
      '<html><body><a href="http://partner-site.com/page">Partner</a></body></html>',
    );
    expect(find(findings, 'content.mixed_content').status).toBe('pass');
  });

  it('fails a script loaded over plain HTTP', () => {
    const findings = withBody(
      '<html><head><script src="http://cdn.example.com/a.js"></script></head></html>',
    );
    const mixed = find(findings, 'content.mixed_content');
    expect(mixed.status).toBe('fail');
    expect(mixed.severity).toBe('high');
  });

  it('warns, rather than fails, on an image loaded over plain HTTP', () => {
    const findings = withBody(
      '<html><body><img src="http://cdn.example.com/logo.png"></body></html>',
    );
    const mixed = find(findings, 'content.mixed_content');
    expect(mixed.status).toBe('warn');
    expect(mixed.severity).toBe('medium');
  });

  it('detects an outdated library and leaves a current one alone', () => {
    const stale = withBody(
      '<script src="https://cdn.example.com/jquery-1.11.3.min.js"></script>',
    );
    expect(find(stale, 'content.vulnerable_libraries').status).toBe('warn');

    const current = withBody(
      '<script src="https://cdn.example.com/jquery-3.7.1.min.js"></script>',
    );
    expect(find(current, 'content.vulnerable_libraries').status).toBe('pass');
  });
});

describe('cookie checks', () => {
  const withCookies = (setCookie: string[]) =>
    cookieChecks(perfectEvidence({ https: httpsProbe({ setCookie }) }));

  it('passes when no cookies are set, and says so plainly', () => {
    const [finding] = withCookies([]);
    expect(finding.status).toBe('pass');
    expect(finding.detail).toMatch(/behind a login/i);
  });

  it('passes fully protected cookies', () => {
    const [finding] = withCookies([
      'sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax',
    ]);
    expect(finding.status).toBe('pass');
    expect(finding.pointsEarned).toBe(8);
  });

  it('fails a cookie missing Secure, since it can travel in the clear', () => {
    const [finding] = withCookies(['sid=abc; Path=/; HttpOnly; SameSite=Lax']);
    expect(finding.status).toBe('fail');
  });

  it('warns on a cookie readable by injected JavaScript', () => {
    const [finding] = withCookies(['sid=abc; Path=/; Secure; SameSite=Lax']);
    expect(finding.status).toBe('warn');
    expect(finding.detail).toMatch(/HttpOnly/);
  });
});

describe('email and DNS checks', () => {
  const withDns = (dns: Partial<ReturnType<typeof perfectEvidence>['dns']>) =>
    dnsChecks(
      perfectEvidence({ dns: { ...perfectEvidence().dns, ...dns } }),
    );

  it('fails a domain with no SPF record', () => {
    expect(find(withDns({ txt: [] }), 'dns.spf').status).toBe('fail');
  });

  it('treats an SPF record ending in +all as no protection', () => {
    const finding = find(withDns({ txt: ['v=spf1 +all'] }), 'dns.spf');
    expect(finding.status).toBe('warn');
    expect(finding.pointsEarned).toBeLessThan(3);
  });

  it('gives soft-fail SPF slightly less credit than hard-fail', () => {
    const soft = find(withDns({ txt: ['v=spf1 include:x.com ~all'] }), 'dns.spf');
    const hard = find(withDns({ txt: ['v=spf1 include:x.com -all'] }), 'dns.spf');
    expect(soft.status).toBe('pass');
    expect(soft.pointsEarned).toBeLessThan(hard.pointsEarned);
  });

  it('fails a domain with no DMARC record', () => {
    expect(find(withDns({ dmarc: [] }), 'dns.dmarc').status).toBe('fail');
  });

  it('marks p=none as monitoring only', () => {
    const finding = find(
      withDns({ dmarc: ['v=DMARC1; p=none; rua=mailto:a@b.com'] }),
      'dns.dmarc',
    );
    expect(finding.status).toBe('warn');
    expect(finding.title).toMatch(/monitor/i);
  });

  it('gives p=reject full marks and p=quarantine slightly fewer', () => {
    const reject = find(withDns({ dmarc: ['v=DMARC1; p=reject'] }), 'dns.dmarc');
    const quarantine = find(
      withDns({ dmarc: ['v=DMARC1; p=quarantine'] }),
      'dns.dmarc',
    );
    expect(reject.pointsEarned).toBe(6);
    expect(quarantine.pointsEarned).toBeLessThan(reject.pointsEarned);
  });

  it('warns when no CAA record restricts certificate issuance', () => {
    expect(find(withDns({ caa: [] }), 'dns.caa').status).toBe('warn');
  });
});

describe('exposed file checks', () => {
  it('does not probe paths on an unverified domain, and does not affect the score', () => {
    const findings = exposureChecks(perfectEvidence({ verified: false }));
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe('info');
    expect(findings[0].pointsPossible).toBe(0);
    expect(findings[0].penalty).toBeUndefined();
  });

  it('applies a flat penalty that sinks an otherwise perfect site', () => {
    const exposed = perfectEvidence({
      verified: true,
      exposedPaths: [
        { path: '/.env', status: 200, signature: 'ENV' },
      ],
    });

    const clean = evaluate(perfectEvidence({ verified: true }));
    const leaking = evaluate(exposed);

    expect(clean.score).toBe(100);
    expect(clean.grade).toBe('A+');
    // Everything else about the site is still perfect, but one published
    // secrets file must not leave it looking healthy.
    expect(leaking.score).toBe(70);
    expect(leaking.grade).toBe('C');
    expect(leaking.penaltyApplied).toBe(30);
  });

  it('never drives the score below zero', () => {
    const findings = evaluate(
      perfectEvidence({
        verified: true,
        exposedPaths: [
          { path: '/.env', status: 200, signature: 'ENV' },
          { path: '/.git/HEAD', status: 200, signature: 'GIT' },
          { path: '/backup.sql', status: 200, signature: 'SQL' },
          { path: '/phpinfo.php', status: 200, signature: 'PHP' },
        ],
      }),
    );
    expect(findings.score).toBe(0);
    expect(findings.grade).toBe('F');
  });
});

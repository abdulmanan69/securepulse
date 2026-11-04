import type { HttpProbe, ScanEvidence, TlsInfo } from '@/lib/scanner/types';

/**
 * Fixture builders for the check suite.
 *
 * Checks are pure functions over an evidence bundle, so the entire scoring
 * system can be tested deterministically with no network. These builders
 * default to a perfectly configured site; each test overrides only the one
 * thing it is about.
 */

export function httpsProbe(overrides: Partial<HttpProbe> = {}): HttpProbe {
  return {
    url: 'https://example-site.com/',
    finalUrl: 'https://example-site.com/',
    status: 200,
    headers: {
      'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
      'content-security-policy':
        "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'content-type': 'text/html; charset=utf-8',
    },
    setCookie: [],
    body: '<html><head><script src="https://cdn.example.com/app.js"></script></head><body>hi</body></html>',
    redirectChain: [],
    timingMs: 120,
    ...overrides,
  };
}

export function tlsInfo(overrides: Partial<TlsInfo> = {}): TlsInfo {
  return {
    protocol: 'TLSv1.3',
    cipher: 'TLS_AES_256_GCM_SHA384',
    subject: 'example-site.com',
    issuer: 'Example CA',
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    daysUntilExpiry: 200,
    authorized: true,
    authorizationError: null,
    altNames: ['example-site.com', 'www.example-site.com'],
    ...overrides,
  };
}

/** A site that does everything right. Should score 100 / A+. */
export function perfectEvidence(
  overrides: Partial<ScanEvidence> = {},
): ScanEvidence {
  return {
    hostname: 'example-site.com',
    https: httpsProbe(),
    http: httpsProbe({
      url: 'http://example-site.com/',
      finalUrl: 'https://example-site.com/',
      redirectChain: ['http://example-site.com/'],
      status: 301,
    }),
    tls: tlsInfo(),
    dns: {
      a: ['93.184.216.34'],
      aaaa: [],
      mx: ['10 mail.example-site.com'],
      txt: ['v=spf1 include:_spf.example.com -all'],
      caa: ['0 issue "letsencrypt.org"'],
      dmarc: ['v=DMARC1; p=reject; rua=mailto:dmarc@example-site.com'],
    },
    securityTxt: {
      found: true,
      url: 'https://example-site.com/.well-known/security.txt',
      status: 200,
    },
    exposedPaths: [],
    verified: false,
    warnings: [],
    ...overrides,
  };
}

/** A site that does nothing right. Should score near zero / F. */
export function terribleEvidence(
  overrides: Partial<ScanEvidence> = {},
): ScanEvidence {
  return {
    hostname: 'bad-site.com',
    https: null,
    http: httpsProbe({
      url: 'http://bad-site.com/',
      finalUrl: 'http://bad-site.com/',
      status: 200,
      headers: { server: 'Apache/2.2.15', 'x-powered-by': 'PHP/5.4.16' },
    }),
    tls: null,
    dns: { a: ['1.2.3.4'], aaaa: [], mx: [], txt: [], caa: [], dmarc: [] },
    securityTxt: { found: false, url: null, status: 404 },
    exposedPaths: [],
    verified: false,
    warnings: [],
    ...overrides,
  };
}

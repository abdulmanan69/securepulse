import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Security response headers for SecurePulse itself.
 *
 * A product that grades other people's headers has to pass its own check. The
 * scanner is pointed at this app in tests/live, so a regression here fails the
 * suite rather than becoming an embarrassment in a customer demo.
 */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js injects inline bootstrap scripts; 'strict-dynamic' with a
      // nonce would require custom middleware on every route, which is the
      // documented trade-off here.
      // React's development build uses eval() to reconstruct callstacks. It
      // never does so in a production build, so the relaxation is scoped to
      // dev only rather than weakening the shipped policy.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data:",
      // Checkout redirects to Stripe; nothing else may be connected to.
      "connect-src 'self' https://api.stripe.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  // PGlite ships a WASM binary that must not be traced into the server bundle.
  serverExternalPackages: ['@electric-sql/pglite'],

  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

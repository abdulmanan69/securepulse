import type { Check, Finding, HttpProbe } from '../types';

/**
 * Response-header hardening.
 *
 * These are the controls that turn a working site into one that resists XSS,
 * clickjacking and data leakage. They are cheap to add and almost always
 * missing, which is exactly why this category carries the most weight after
 * transport.
 */

function missing(
  checkId: string,
  title: string,
  detail: string,
  remediation: string,
  points: number,
  severity: Finding['severity'],
): Finding {
  return {
    checkId,
    category: 'headers',
    status: 'fail',
    severity,
    title,
    detail,
    remediation,
    pointsEarned: 0,
    pointsPossible: points,
  };
}

/** Parses `max-age=31536000; includeSubDomains; preload` into its parts. */
function parseHsts(value: string) {
  const maxAgeMatch = value.match(/max-age\s*=\s*"?(\d+)"?/i);
  return {
    maxAge: maxAgeMatch ? Number(maxAgeMatch[1]) : null,
    includeSubDomains: /includesubdomains/i.test(value),
    preload: /preload/i.test(value),
  };
}

function checkHsts(https: HttpProbe): Finding {
  const value = https.headers['strict-transport-security'];
  if (!value) {
    return missing(
      'headers.hsts',
      'HSTS is not enabled',
      'Without HSTS a visitor\u2019s very first request each session can still be made over plain HTTP, which is the moment an attacker on the same network downgrades the connection and intercepts it. The HTTPS redirect alone does not close this gap.',
      'Send Strict-Transport-Security: max-age=31536000; includeSubDomains on every HTTPS response.',
      8,
      'high',
    );
  }

  const { maxAge, includeSubDomains, preload } = parseHsts(value);
  const sixMonths = 15_552_000;

  if (maxAge === null || maxAge < 86_400) {
    return {
      checkId: 'headers.hsts',
      category: 'headers',
      status: 'warn',
      severity: 'medium',
      title: 'HSTS is set but the max-age is too short to help',
      detail:
        'A very short max-age means the browser forgets the rule almost immediately, so the protection rarely applies in practice.',
      evidence: { header: value, maxAge },
      remediation: 'Raise max-age to at least 15552000 (six months).',
      pointsEarned: 2,
      pointsPossible: 8,
    };
  }

  const full = maxAge >= sixMonths && includeSubDomains;
  return {
    checkId: 'headers.hsts',
    category: 'headers',
    status: full ? 'pass' : 'warn',
    severity: full ? 'info' : 'low',
    title: full
      ? 'HSTS is enabled with a strong policy'
      : 'HSTS is enabled but could be stronger',
    detail: full
      ? 'Browsers will refuse to talk to this domain over plain HTTP, including on a visitor\u2019s first request of the session.'
      : `The policy is active but ${!includeSubDomains ? 'does not cover subdomains' : 'uses a shorter max-age than recommended'}.`,
    evidence: { header: value, maxAge, includeSubDomains, preload },
    remediation: full
      ? undefined
      : 'Use max-age=31536000; includeSubDomains, then consider submitting to the HSTS preload list.',
    pointsEarned: full ? 8 : 5,
    pointsPossible: 8,
  };
}

/**
 * Grades CSP on whether it would actually stop an injected script. A policy
 * built from `unsafe-inline` plus a wildcard is common and provides close to
 * no protection, so it is reported as weak rather than as a pass.
 */
function checkCsp(https: HttpProbe): Finding {
  const value =
    https.headers['content-security-policy'] ??
    https.headers['content-security-policy-report-only'];
  const reportOnly =
    !https.headers['content-security-policy'] &&
    !!https.headers['content-security-policy-report-only'];

  if (!value) {
    return missing(
      'headers.csp',
      'No Content-Security-Policy',
      'CSP is the main defence against cross-site scripting: it tells the browser which scripts are allowed to run, so injected code is refused even if an attacker manages to get it onto the page. Without it, any XSS flaw anywhere on the site runs with full access to your visitors\u2019 sessions.',
      'Start with a report-only policy to find what breaks, then enforce: default-src \u0027self\u0027; object-src \u0027none\u0027; frame-ancestors \u0027none\u0027; base-uri \u0027self\u0027.',
      9,
      'high',
    );
  }

  const lower = value.toLowerCase();
  const weaknesses: string[] = [];
  if (lower.includes('unsafe-inline') && !/'nonce-|'sha(256|384|512)-/.test(lower)) {
    weaknesses.push("script-src allows 'unsafe-inline' with no nonce or hash");
  }
  if (lower.includes('unsafe-eval')) weaknesses.push("'unsafe-eval' is allowed");
  if (/(default|script)-src[^;]*\*(\s|;|$)/.test(lower)) {
    weaknesses.push('a wildcard source is allowed');
  }
  if (!lower.includes('object-src') && !lower.includes('default-src')) {
    weaknesses.push('no object-src or default-src fallback');
  }

  if (reportOnly) {
    return {
      checkId: 'headers.csp',
      category: 'headers',
      status: 'warn',
      severity: 'medium',
      title: 'Content-Security-Policy is report-only',
      detail:
        'The policy is being monitored but not enforced, so it records violations without blocking anything. That is the right first step, but it stops no attacks until it is enforced.',
      evidence: { header: value },
      remediation:
        'Once the violation reports are clean, move the policy to the enforcing Content-Security-Policy header.',
      pointsEarned: 4,
      pointsPossible: 9,
    };
  }

  if (weaknesses.length > 0) {
    return {
      checkId: 'headers.csp',
      category: 'headers',
      status: 'warn',
      severity: 'medium',
      title: 'Content-Security-Policy is present but weak',
      detail: `The policy is enforced, but ${weaknesses.join(', ')}. An injected script would very likely still run.`,
      evidence: { header: value, weaknesses },
      remediation:
        'Remove unsafe-inline and unsafe-eval, replace wildcards with explicit origins, and use per-request nonces for inline scripts.',
      pointsEarned: 4,
      pointsPossible: 9,
    };
  }

  return {
    checkId: 'headers.csp',
    category: 'headers',
    status: 'pass',
    severity: 'info',
    title: 'A strict Content-Security-Policy is enforced',
    detail:
      'The browser will refuse to run scripts from anywhere this policy does not explicitly allow.',
    evidence: { header: value },
    pointsEarned: 9,
    pointsPossible: 9,
  };
}

function checkFrameAncestors(https: HttpProbe): Finding {
  const xfo = https.headers['x-frame-options'];
  const csp = https.headers['content-security-policy'] ?? '';
  const cspCovers = /frame-ancestors/i.test(csp);
  const xfoValid = !!xfo && /^(deny|sameorigin)$/i.test(xfo.trim());

  if (cspCovers || xfoValid) {
    return {
      checkId: 'headers.frame_ancestors',
      category: 'headers',
      status: 'pass',
      severity: 'info',
      title: 'The site cannot be embedded by other sites',
      detail:
        'Clickjacking is prevented: another site cannot load your pages in a hidden frame and trick visitors into clicking them.',
      evidence: {
        xFrameOptions: xfo ?? null,
        cspFrameAncestors: cspCovers
          ? (csp.match(/frame-ancestors[^;]*/i)?.[0] ?? null)
          : null,
      },
      pointsEarned: 5,
      pointsPossible: 5,
    };
  }

  return missing(
    'headers.frame_ancestors',
    'The site can be embedded in a frame by anyone',
    'An attacker can load your pages inside an invisible frame on their own site and overlay it with their own buttons, so a visitor who thinks they are clicking one thing actually clicks something on your site while logged in. This is clickjacking.',
    "Send Content-Security-Policy: frame-ancestors 'none' (or 'self'), and X-Frame-Options: DENY for older browsers.",
    5,
    'medium',
  );
}

function checkNosniff(https: HttpProbe): Finding {
  const value = https.headers['x-content-type-options'];
  const ok = !!value && value.trim().toLowerCase() === 'nosniff';

  return ok
    ? {
        checkId: 'headers.x_content_type_options',
        category: 'headers',
        status: 'pass',
        severity: 'info',
        title: 'MIME type sniffing is disabled',
        detail:
          'Browsers will treat each file as the type the server declares, rather than guessing.',
        evidence: { header: value },
        pointsEarned: 4,
        pointsPossible: 4,
      }
    : missing(
        'headers.x_content_type_options',
        'MIME type sniffing is not disabled',
        'Browsers may ignore the declared content type and guess instead. An uploaded file that the server calls an image can then be executed as a script.',
        'Send X-Content-Type-Options: nosniff on every response.',
        4,
        'low',
      );
}

function checkReferrerPolicy(https: HttpProbe): Finding {
  const value = https.headers['referrer-policy'];
  const strong = [
    'no-referrer',
    'same-origin',
    'strict-origin',
    'strict-origin-when-cross-origin',
  ];
  const ok = !!value && strong.includes(value.trim().toLowerCase());

  return ok
    ? {
        checkId: 'headers.referrer_policy',
        category: 'headers',
        status: 'pass',
        severity: 'info',
        title: 'Referrer-Policy limits what leaks to other sites',
        detail:
          'Full URLs, which often contain tokens or account identifiers, are not handed to third-party sites your visitors click through to.',
        evidence: { header: value },
        pointsEarned: 4,
        pointsPossible: 4,
      }
    : missing(
        'headers.referrer_policy',
        value ? 'Referrer-Policy is weaker than recommended' : 'No Referrer-Policy',
        'When a visitor clicks an external link, the browser tells that site the exact page they came from. If your URLs contain reset tokens, invite codes or account ids, those are handed to a third party.',
        'Send Referrer-Policy: strict-origin-when-cross-origin.',
        4,
        'low',
      );
}

function checkPermissionsPolicy(https: HttpProbe): Finding {
  const value = https.headers['permissions-policy'];
  return value
    ? {
        checkId: 'headers.permissions_policy',
        category: 'headers',
        status: 'pass',
        severity: 'info',
        title: 'Permissions-Policy restricts browser features',
        detail:
          'Powerful features such as camera, microphone and geolocation are explicitly restricted.',
        evidence: { header: value },
        pointsEarned: 4,
        pointsPossible: 4,
      }
    : missing(
        'headers.permissions_policy',
        'No Permissions-Policy',
        'Embedded third-party code can request access to the camera, microphone, geolocation and other sensitive features on your behalf.',
        'Send Permissions-Policy: camera=(), microphone=(), geolocation=() and allow only what the site actually uses.',
        4,
        'low',
      );
}

/** Every header finding carries points, so an unreachable site scores zero. */
const UNREACHABLE: Array<[string, number]> = [
  ['headers.hsts', 8],
  ['headers.csp', 9],
  ['headers.frame_ancestors', 5],
  ['headers.x_content_type_options', 4],
  ['headers.referrer_policy', 4],
  ['headers.permissions_policy', 4],
];

export const headerChecks: Check = (evidence): Finding[] => {
  const { https } = evidence;

  if (!https) {
    // No response means no headers to grade. Award nothing rather than
    // silently shrinking the denominator, which would let an unreachable site
    // score better than a reachable one.
    return UNREACHABLE.map(([checkId, points]) => ({
      checkId,
      category: 'headers' as const,
      status: 'fail' as const,
      severity: 'info' as const,
      title: 'Not assessed: the site did not respond over HTTPS',
      detail:
        'Security headers could not be read because no HTTPS response was received.',
      pointsEarned: 0,
      pointsPossible: points,
    }));
  }

  return [
    checkHsts(https),
    checkCsp(https),
    checkFrameAncestors(https),
    checkNosniff(https),
    checkReferrerPolicy(https),
    checkPermissionsPolicy(https),
  ];
};

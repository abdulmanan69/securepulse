import type { Check, Finding } from '../types';

/**
 * Cookie attribute hygiene.
 *
 * Judged on the cookies the homepage actually sets. A cookie missing Secure
 * can be sent over plain HTTP; missing HttpOnly can be read by injected
 * JavaScript; missing SameSite can be sent along with a cross-site request.
 */

interface ParsedCookie {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
}

function parseSetCookie(raw: string): ParsedCookie {
  const [pair, ...attributes] = raw.split(';');
  const name = pair.split('=')[0]?.trim() ?? '(unnamed)';
  const flags = attributes.map((a) => a.trim().toLowerCase());
  const sameSite = flags
    .find((flag) => flag.startsWith('samesite='))
    ?.split('=')[1];

  return {
    name,
    secure: flags.includes('secure'),
    httpOnly: flags.includes('httponly'),
    sameSite: sameSite ?? null,
  };
}

export const cookieChecks: Check = (evidence): Finding[] => {
  const raw = evidence.https?.setCookie ?? [];

  if (raw.length === 0) {
    // Nothing set on the homepage. Full marks: there is no weak cookie here.
    // Stated plainly so the report does not imply we inspected a login flow.
    return [
      {
        checkId: 'cookies.flags',
        category: 'cookies',
        status: 'pass',
        severity: 'info',
        title: 'No cookies are set on the homepage',
        detail:
          'The homepage sets no cookies, so there are no cookie attributes to get wrong here. Pages behind a login may still set session cookies that this check does not see.',
        pointsEarned: 8,
        pointsPossible: 8,
      },
    ];
  }

  const cookies = raw.map(parseSetCookie);
  const insecure = cookies.filter((c) => !c.secure);
  const scriptReadable = cookies.filter((c) => !c.httpOnly);
  const noSameSite = cookies.filter(
    (c) => c.sameSite === null || c.sameSite === 'none',
  );

  const problems: string[] = [];
  if (insecure.length > 0) {
    problems.push(
      `${insecure.length} missing Secure, so they can be sent over plain HTTP`,
    );
  }
  if (scriptReadable.length > 0) {
    problems.push(
      `${scriptReadable.length} missing HttpOnly, so injected JavaScript can read them`,
    );
  }
  if (noSameSite.length > 0) {
    problems.push(
      `${noSameSite.length} without a restrictive SameSite, which enables cross-site request forgery`,
    );
  }

  if (problems.length === 0) {
    return [
      {
        checkId: 'cookies.flags',
        category: 'cookies',
        status: 'pass',
        severity: 'info',
        title: `All ${cookies.length} cookies are set securely`,
        detail:
          'Every cookie carries Secure, HttpOnly and a restrictive SameSite value.',
        evidence: { cookies },
        pointsEarned: 8,
        pointsPossible: 8,
      },
    ];
  }

  // Secure is the one whose absence exposes the cookie on the wire, so it is
  // the attribute that decides whether this is a warning or a failure.
  const severe = insecure.length > 0;

  return [
    {
      checkId: 'cookies.flags',
      category: 'cookies',
      status: severe ? 'fail' : 'warn',
      severity: severe ? 'high' : 'medium',
      title: 'Some cookies are missing protective attributes',
      detail: `Of ${cookies.length} cookies set on the homepage: ${problems.join('; ')}.`,
      evidence: { cookies },
      remediation:
        'Set Secure, HttpOnly and SameSite=Lax (or Strict) on every cookie that is not read by your own client-side scripts.',
      pointsEarned: severe ? 2 : 5,
      pointsPossible: 8,
    },
  ];
};

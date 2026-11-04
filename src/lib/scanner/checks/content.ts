import type { Check, Finding } from '../types';

/**
 * What the homepage HTML gives away.
 *
 * Two things are worth reporting without executing anything: subresources
 * loaded over plain HTTP on an HTTPS page, and front-end libraries pinned to a
 * version with published vulnerabilities.
 */

/**
 * Minimum safe versions for libraries that are both extremely common and have
 * well-known advisories below these lines. Deliberately small and
 * conservative: telling a customer they are vulnerable when they are not does
 * more damage to trust than missing one stale library.
 */
const LIBRARY_FLOORS: Array<{
  name: string;
  pattern: RegExp;
  minSafe: [number, number];
  note: string;
}> = [
  {
    name: 'jQuery',
    pattern: /jquery[.-](\d+)\.(\d+)(?:\.\d+)?(?:\.min)?\.js/i,
    minSafe: [3, 5],
    note: 'jQuery below 3.5.0 is affected by published cross-site scripting advisories.',
  },
  {
    name: 'AngularJS',
    pattern: /angular[.-](\d+)\.(\d+)(?:\.\d+)?(?:\.min)?\.js/i,
    minSafe: [1, 8],
    note: 'AngularJS reached end of life and no longer receives security fixes.',
  },
  {
    name: 'Bootstrap',
    pattern: /bootstrap[.-](\d+)\.(\d+)(?:\.\d+)?(?:\.min)?\.(?:js|css)/i,
    minSafe: [4, 0],
    note: 'Bootstrap 3.x is unmaintained and has published XSS advisories.',
  },
];

/**
 * Tags whose URL attribute causes the browser to LOAD something. An ordinary
 * <a href="http://..."> link is not mixed content, so matching on href alone
 * would report a false positive on almost every site on the internet.
 */
const SUBRESOURCE_TAGS =
  /<(script|link|img|iframe|video|audio|source|embed|object|track)\b[^>]*?\b(?:src|href|data)\s*=\s*["'](http:\/\/[^"']+)["'][^>]*>/gi;

/** script and link (stylesheet) can execute; the rest only display. */
const ACTIVE_TAGS = new Set(['script', 'link', 'iframe', 'object', 'embed']);

interface MixedItem {
  tag: string;
  url: string;
  active: boolean;
}

function findMixedContent(body: string): MixedItem[] {
  const seen = new Set<string>();
  const items: MixedItem[] = [];

  for (const match of body.matchAll(SUBRESOURCE_TAGS)) {
    const tag = match[1].toLowerCase();
    const url = match[2];
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ tag, url, active: ACTIVE_TAGS.has(tag) });
    if (items.length >= 25) break;
  }

  return items;
}

function findStaleLibraries(body: string) {
  const stale: Array<{ name: string; version: string; note: string }> = [];

  for (const library of LIBRARY_FLOORS) {
    const match = body.match(library.pattern);
    if (!match) continue;

    const major = Number(match[1]);
    const minor = Number(match[2]);
    const [safeMajor, safeMinor] = library.minSafe;
    const outdated =
      major < safeMajor || (major === safeMajor && minor < safeMinor);

    if (outdated) {
      stale.push({
        name: library.name,
        version: `${major}.${minor}`,
        note: library.note,
      });
    }
  }

  return stale;
}

export const contentChecks: Check = (evidence): Finding[] => {
  const https = evidence.https;

  if (!https || https.body.length === 0) {
    return [
      {
        checkId: 'content.mixed_content',
        category: 'content',
        status: 'fail',
        severity: 'info',
        title: 'Not assessed: no page content was returned',
        detail: 'The homepage returned no HTML to inspect.',
        pointsEarned: 0,
        pointsPossible: 5,
      },
      {
        checkId: 'content.vulnerable_libraries',
        category: 'content',
        status: 'fail',
        severity: 'info',
        title: 'Not assessed: no page content was returned',
        detail: 'The homepage returned no HTML to inspect.',
        pointsEarned: 0,
        pointsPossible: 4,
      },
    ];
  }

  const findings: Finding[] = [];
  const mixed = findMixedContent(https.body);
  const active = mixed.filter((item) => item.active);

  if (mixed.length === 0) {
    findings.push({
      checkId: 'content.mixed_content',
      category: 'content',
      status: 'pass',
      severity: 'info',
      title: 'No mixed content on the homepage',
      detail:
        'Every script, stylesheet and image on the homepage loads over an encrypted connection.',
      pointsEarned: 5,
      pointsPossible: 5,
    });
  } else {
    findings.push({
      checkId: 'content.mixed_content',
      category: 'content',
      status: active.length > 0 ? 'fail' : 'warn',
      severity: active.length > 0 ? 'high' : 'medium',
      title:
        active.length > 0
          ? 'The page loads scripts or styles over plain HTTP'
          : 'The page loads images or media over plain HTTP',
      detail:
        active.length > 0
          ? 'A script or stylesheet fetched over HTTP can be replaced in transit by anyone on the network, and the replacement runs with full access to the page. Browsers block most of this and log a console error, so parts of the site are probably already broken for visitors.'
          : 'Images or media are fetched over an unencrypted connection. Browsers show the padlock as degraded and may refuse to load them.',
      evidence: { items: mixed.slice(0, 10), total: mixed.length },
      remediation:
        'Change these URLs to https:// (or protocol-relative paths), and confirm the third-party hosts support HTTPS.',
      pointsEarned: active.length > 0 ? 0 : 2,
      pointsPossible: 5,
    });
  }

  const stale = findStaleLibraries(https.body);

  findings.push(
    stale.length === 0
      ? {
          checkId: 'content.vulnerable_libraries',
          category: 'content',
          status: 'pass',
          severity: 'info',
          title: 'No known-outdated front-end libraries detected',
          detail:
            'We did not find a version-pinned copy of a library that sits below its minimum safe release. This check reads version numbers out of script URLs, so bundled or renamed copies are not visible to it.',
          pointsEarned: 4,
          pointsPossible: 4,
        }
      : {
          checkId: 'content.vulnerable_libraries',
          category: 'content',
          status: 'warn',
          severity: 'medium',
          title: `${stale.length} outdated front-end librar${stale.length === 1 ? 'y' : 'ies'} detected`,
          detail: stale
            .map((lib) => `${lib.name} ${lib.version}: ${lib.note}`)
            .join(' '),
          evidence: { libraries: stale },
          remediation:
            'Upgrade to a current release. These are usually a one-line change to a CDN URL or a package version.',
          pointsEarned: 1,
          pointsPossible: 4,
        },
  );

  return findings;
};

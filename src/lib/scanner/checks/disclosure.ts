import type { Check, Finding } from '../types';

/**
 * Version disclosure.
 *
 * Publishing exact software versions does not create a vulnerability, but it
 * removes the work of finding one: an attacker scanning for hosts affected by
 * a newly published CVE can select targets from the header alone. Scored
 * modestly, because it is a hardening issue rather than an exposure.
 */

/** Headers that commonly leak a precise product version. */
const REVEALING = [
  'server',
  'x-powered-by',
  'x-aspnet-version',
  'x-aspnetmvc-version',
  'x-generator',
  'x-drupal-cache',
];

/** A bare product name is fine; a version number is what identifies a target. */
const VERSION_PATTERN = /\d+\.\d+/;

export const disclosureChecks: Check = (evidence): Finding[] => {
  const headers = evidence.https?.headers ?? evidence.http?.headers;

  if (!headers) {
    return [
      {
        checkId: 'disclosure.server_headers',
        category: 'disclosure',
        status: 'fail',
        severity: 'info',
        title: 'Not assessed: the site did not respond',
        detail: 'No response headers were received.',
        pointsEarned: 0,
        pointsPossible: 6,
      },
    ];
  }

  const present = REVEALING.filter((name) => headers[name]).map((name) => ({
    header: name,
    value: headers[name],
  }));

  const withVersions = present.filter((entry) =>
    VERSION_PATTERN.test(entry.value),
  );

  if (present.length === 0) {
    return [
      {
        checkId: 'disclosure.server_headers',
        category: 'disclosure',
        status: 'pass',
        severity: 'info',
        title: 'No software versions are advertised',
        detail:
          'The server does not announce which software or version it runs, so it will not show up in a search for hosts running a specific vulnerable build.',
        pointsEarned: 6,
        pointsPossible: 6,
      },
    ];
  }

  if (withVersions.length === 0) {
    return [
      {
        checkId: 'disclosure.server_headers',
        category: 'disclosure',
        status: 'pass',
        severity: 'info',
        title: 'Server headers do not include version numbers',
        detail:
          'Product names are present but no exact versions, which is enough to avoid being trivially fingerprinted.',
        evidence: { headers: present },
        pointsEarned: 6,
        pointsPossible: 6,
      },
    ];
  }

  return [
    {
      checkId: 'disclosure.server_headers',
      category: 'disclosure',
      status: 'warn',
      severity: 'low',
      title: 'Exact software versions are published in response headers',
      detail: `${withVersions.map((entry) => `${entry.header}: ${entry.value}`).join(', ')}. When a vulnerability is published for one of these versions, this site can be found by searching for that header rather than by testing it.`,
      evidence: { headers: present },
      remediation:
        'Suppress or shorten these headers. Most web servers expose a single directive for this, such as server_tokens off in nginx or ServerTokens Prod in Apache.',
      pointsEarned: 2,
      pointsPossible: 6,
    },
  ];
};

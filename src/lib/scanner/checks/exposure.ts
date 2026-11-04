import type { Check, Finding } from '../types';

/**
 * Accidentally published files.
 *
 * This is the only check that requests paths other than the homepage, so it is
 * gated on DNS ownership verification. It issues plain GETs, exactly what a
 * crawler does, and sends no payload of any kind.
 *
 * A status of 200 is not enough to report a finding: a great many sites answer
 * every unknown path with a 200 and a friendly HTML error page. Each candidate
 * must also match a content signature unique to the real file, because telling
 * a customer their environment file is public when it is not would be worse
 * than saying nothing.
 */

export interface SensitivePath {
  path: string;
  label: string;
  /** Content that only the genuine file would contain. */
  signature: RegExp;
  why: string;
}

export const SENSITIVE_PATHS: SensitivePath[] = [
  {
    path: '/.env',
    label: 'Environment file',
    signature: /^\s*(?:[A-Z0-9_]+\s*=|#)/m,
    why: 'Environment files hold database passwords, API keys and signing secrets in plain text.',
  },
  {
    path: '/.git/HEAD',
    label: 'Git repository',
    signature: /^ref:\s+refs\//m,
    why: 'An exposed .git directory usually allows the entire source history, including any secrets ever committed, to be reconstructed.',
  },
  {
    path: '/.git/config',
    label: 'Git configuration',
    signature: /\[core\]|\[remote\s+"/m,
    why: 'Reveals the repository origin and sometimes embedded access tokens.',
  },
  {
    path: '/wp-config.php.bak',
    label: 'WordPress config backup',
    signature: /DB_PASSWORD|DB_NAME|<\?php/m,
    why: 'A backup of wp-config.php is served as plain text rather than executed, exposing the database credentials.',
  },
  {
    path: '/.svn/entries',
    label: 'Subversion metadata',
    signature: /^\d+\s*$|svn:/m,
    why: 'Exposes source control metadata and can allow source recovery.',
  },
  {
    path: '/phpinfo.php',
    label: 'phpinfo output',
    signature: /phpinfo\(\)|PHP Version\s*<\/td>/m,
    why: 'Publishes the full PHP configuration, absolute paths, loaded modules and environment variables.',
  },
  {
    path: '/.DS_Store',
    label: 'macOS directory index',
    signature: /Bud1/,
    why: 'Leaks the names of files in the directory, including ones not meant to be discoverable.',
  },
  {
    path: '/backup.sql',
    label: 'Database dump',
    signature: /CREATE TABLE|INSERT INTO|-- MySQL dump/im,
    why: 'A database dump served over the web exposes customer data directly.',
  },
];

export const exposureChecks: Check = (evidence): Finding[] => {
  if (!evidence.verified) {
    return [
      {
        checkId: 'exposure.sensitive_paths',
        category: 'exposure',
        status: 'info',
        severity: 'info',
        title: 'Exposed file discovery requires domain verification',
        detail:
          'Checking for accidentally published files such as .env or .git requires requesting paths beyond the homepage. We only do that on domains whose ownership has been proven with a DNS record, so the tool cannot be pointed at someone else\u2019s site.',
        evidence: { pathsChecked: 0 },
        // Informational only: it must not change the score either way, so an
        // unverified domain stays comparable with a verified one.
        pointsEarned: 0,
        pointsPossible: 0,
      },
    ];
  }

  const exposed = evidence.exposedPaths;

  if (exposed.length === 0) {
    return [
      {
        checkId: 'exposure.sensitive_paths',
        category: 'exposure',
        status: 'pass',
        severity: 'info',
        title: 'No accidentally published files found',
        detail: `We requested ${SENSITIVE_PATHS.length} commonly-leaked paths and none returned the real file.`,
        evidence: { pathsChecked: SENSITIVE_PATHS.length },
        pointsEarned: 0,
        pointsPossible: 0,
      },
    ];
  }

  return exposed.map((item) => {
    const definition = SENSITIVE_PATHS.find((p) => p.path === item.path);
    return {
      checkId: `exposure.sensitive_paths`,
      category: 'exposure' as const,
      status: 'fail' as const,
      severity: 'critical' as const,
      title: `${definition?.label ?? 'Sensitive file'} is publicly downloadable at ${item.path}`,
      detail: `${definition?.why ?? 'This file should not be reachable from the web.'} We confirmed the response is the genuine file, not a generic error page.`,
      evidence: {
        path: item.path,
        status: item.status,
        matchedSignature: item.signature,
      },
      remediation:
        'Remove the file from the web root immediately and treat every credential it contains as compromised: rotate them. Then block these paths at the web server or CDN.',
      pointsEarned: 0,
      pointsPossible: 0,
      // Flat deduction. A publicly readable .env is not a missing-header-sized
      // problem, and a site with one must not be able to score a B because the
      // rest of its configuration is tidy.
      penalty: 30,
    };
  });
};

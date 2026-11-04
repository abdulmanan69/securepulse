import type { Check, Finding } from '../types';

/**
 * RFC 9116 security.txt.
 *
 * Low weight and deliberately so: it prevents nothing. What it does is give a
 * researcher who finds a flaw somewhere to report it, instead of guessing at
 * an address, giving up, or publishing it. Cheap to add, occasionally decisive.
 */
export const policyChecks: Check = (evidence): Finding[] => {
  const { securityTxt } = evidence;

  if (securityTxt.found) {
    return [
      {
        checkId: 'policy.security_txt',
        category: 'policy',
        status: 'pass',
        severity: 'info',
        title: 'A security.txt contact policy is published',
        detail:
          'Someone who discovers a vulnerability has a documented way to report it to you.',
        evidence: { url: securityTxt.url },
        pointsEarned: 3,
        pointsPossible: 3,
      },
    ];
  }

  return [
    {
      checkId: 'policy.security_txt',
      category: 'policy',
      status: 'warn',
      severity: 'low',
      title: 'No security.txt contact policy',
      detail:
        'There is no published route for reporting a security problem. Researchers who find something either guess at an address, give up, or disclose publicly.',
      evidence: {
        checked: `https://${evidence.hostname}/.well-known/security.txt`,
        status: securityTxt.status,
      },
      remediation:
        'Publish a plain text file at /.well-known/security.txt containing at least a Contact: line and an Expires: date.',
      pointsEarned: 0,
      pointsPossible: 3,
    },
  ];
};

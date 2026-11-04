import type { Check, Finding } from '../types';

/**
 * Transport security: is the site reachable over HTTPS, does it force the
 * upgrade, and is the certificate one a browser will actually trust.
 *
 * Weighted highest of all categories because a failure here is not a hardening
 * gap, it is a site that is actively unsafe to use today.
 */
export const transportChecks: Check = (evidence): Finding[] => {
  const findings: Finding[] = [];
  const { https, http, tls } = evidence;

  if (!https) {
    // Distinguish "there is no HTTPS here" from "TLS works but the page did
    // not load". Both score zero, but they are different problems and a report
    // that blurs them sends the customer to fix the wrong thing.
    const tlsWorks = !!tls && tls.authorized;

    findings.push({
      checkId: 'transport.https_redirect',
      category: 'transport',
      status: 'fail',
      severity: 'critical',
      title: tlsWorks
        ? 'HTTPS is configured but the page did not load over it'
        : 'The site is not reachable over HTTPS',
      detail: tlsWorks
        ? 'The certificate is valid and the encrypted connection is established, but no page was returned over it before the request timed out. Visitors are most likely being served over plain HTTP instead, where everything they send can be read or altered by anyone on the network.'
        : 'We could not load this site over an encrypted connection. Everything visitors send, including passwords and card details, travels in plain text where anyone on the network can read or alter it. Browsers also label the site as not secure.',
      evidence: {
        attempted: `https://${evidence.hostname}/`,
        tlsHandshake: tlsWorks ? 'succeeded' : 'failed or not attempted',
      },
      remediation: tlsWorks
        ? 'Check that the web server is listening on port 443 and serving the site, not just terminating TLS.'
        : 'Install a TLS certificate. Several authorities issue them free and most hosting panels can enable one in a single click.',
      pointsEarned: 0,
      pointsPossible: 8,
    });
  } else {
    // A visitor who types the bare domain lands on HTTP first. That first
    // request is the one an attacker intercepts, so the upgrade has to be
    // automatic rather than something the visitor is expected to type.
    const upgraded = http
      ? http.finalUrl.startsWith('https://')
      : // HTTP refused outright is also a correct, stricter posture.
        true;

    findings.push(
      upgraded
        ? {
            checkId: 'transport.https_redirect',
            category: 'transport',
            status: 'pass',
            severity: 'info',
            title: 'Plain HTTP is redirected to HTTPS',
            detail:
              'Visitors who arrive on the unencrypted address are moved to the secure one automatically.',
            evidence: {
              httpFinalUrl: http?.finalUrl ?? 'HTTP not served',
              redirectChain: http?.redirectChain ?? [],
            },
            pointsEarned: 8,
            pointsPossible: 8,
          }
        : {
            checkId: 'transport.https_redirect',
            category: 'transport',
            status: 'fail',
            severity: 'high',
            title: 'Plain HTTP is served without redirecting to HTTPS',
            detail:
              'The site answers on the unencrypted address and leaves visitors there. Anyone between the visitor and the server can read and modify that traffic, and a login submitted on that page is exposed.',
            evidence: {
              httpStatus: http?.status ?? null,
              httpFinalUrl: http?.finalUrl ?? null,
            },
            remediation:
              'Return a 301 redirect from every HTTP URL to the same path on HTTPS.',
            pointsEarned: 0,
            pointsPossible: 8,
          },
    );
  }

  if (!tls || tls.error) {
    findings.push({
      checkId: 'transport.tls_certificate',
      category: 'transport',
      status: https ? 'warn' : 'fail',
      severity: https ? 'medium' : 'critical',
      title: 'The certificate could not be inspected',
      detail:
        'The TLS handshake did not complete, so we cannot confirm the certificate is valid or say when it expires.',
      evidence: { error: tls?.error ?? 'No TLS response.' },
      remediation:
        'Confirm the site answers on port 443 and that no firewall blocks the handshake.',
      pointsEarned: 0,
      pointsPossible: 9,
    });
  } else if (!tls.authorized) {
    findings.push({
      checkId: 'transport.tls_certificate',
      category: 'transport',
      status: 'fail',
      severity: 'critical',
      title: 'The certificate is not trusted by browsers',
      detail:
        'Browsers show a full-page security warning before letting anyone through. Most visitors leave at that screen, so this is both a security problem and a direct loss of traffic.',
      evidence: {
        reason: tls.authorizationError,
        issuer: tls.issuer,
        validTo: tls.validTo,
        subject: tls.subject,
      },
      remediation:
        'Reissue the certificate for this exact hostname from a public certificate authority and install the full chain, including intermediates.',
      pointsEarned: 0,
      pointsPossible: 9,
    });
  } else {
    const days = tls.daysUntilExpiry;
    const critical = days !== null && days <= 14;
    const soon = days !== null && days <= 30;

    findings.push({
      checkId: 'transport.tls_certificate',
      category: 'transport',
      status: critical ? 'fail' : soon ? 'warn' : 'pass',
      severity: critical ? 'high' : soon ? 'medium' : 'info',
      title: soon
        ? `The certificate expires in ${days} days`
        : 'The certificate is valid and trusted',
      detail: soon
        ? 'When it expires every visitor sees a full-page browser warning. Renewals that depend on someone remembering are the most common cause of unplanned outages.'
        : `Browsers trust this certificate. It is valid for another ${days} days.`,
      evidence: {
        issuer: tls.issuer,
        subject: tls.subject,
        validFrom: tls.validFrom,
        validTo: tls.validTo,
        daysUntilExpiry: days,
      },
      remediation: soon
        ? 'Turn on automatic renewal so this never depends on a calendar reminder.'
        : undefined,
      // Partial credit: valid today but about to lapse is not a clean pass.
      pointsEarned: critical ? 3 : soon ? 6 : 9,
      pointsPossible: 9,
    });
  }

  if (tls?.protocol) {
    const isModern = tls.protocol === 'TLSv1.3' || tls.protocol === 'TLSv1.2';
    findings.push({
      checkId: 'transport.tls_version',
      category: 'transport',
      status: isModern ? 'pass' : 'fail',
      severity: isModern ? 'info' : 'high',
      title: isModern
        ? `Negotiated ${tls.protocol}`
        : `Negotiated the obsolete ${tls.protocol}`,
      detail: isModern
        ? 'The connection uses a current version of TLS.'
        : 'This protocol version has known weaknesses and fails PCI DSS. Browsers have warned on it for years and are removing support.',
      evidence: { protocol: tls.protocol, cipher: tls.cipher },
      remediation: isModern
        ? undefined
        : 'Disable TLS 1.0 and 1.1 in the server configuration and serve TLS 1.2 and 1.3 only.',
      pointsEarned: isModern ? 8 : 0,
      pointsPossible: 8,
    });
  } else {
    findings.push({
      checkId: 'transport.tls_version',
      category: 'transport',
      status: 'fail',
      severity: 'high',
      title: 'No TLS protocol version could be negotiated',
      detail: 'No encrypted connection was established with this host.',
      evidence: { error: tls?.error ?? 'No handshake.' },
      pointsEarned: 0,
      pointsPossible: 8,
    });
  }

  return findings;
};

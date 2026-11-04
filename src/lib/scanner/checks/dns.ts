import type { Check, Finding } from '../types';

/**
 * Email authentication and certificate authorisation.
 *
 * This category is the one most often missing entirely, and the one with the
 * most direct commercial consequence: without SPF and DMARC anyone can send
 * mail that appears to come from the domain, which is how invoice fraud and
 * credential phishing against a company's own customers usually start.
 */

function parseSpf(records: string[]): string | null {
  return records.find((record) => record.toLowerCase().startsWith('v=spf1')) ?? null;
}

function checkSpf(txt: string[]): Finding {
  const spf = parseSpf(txt);

  if (!spf) {
    return {
      checkId: 'dns.spf',
      category: 'email_dns',
      status: 'fail',
      severity: 'high',
      title: 'No SPF record',
      detail:
        'SPF lists which mail servers are allowed to send mail for this domain. Without it, anyone can send email that appears to come from your address, and receiving servers have no way to tell the difference.',
      remediation:
        'Publish a TXT record at the domain root, for example: v=spf1 include:your-mail-provider.com -all',
      pointsEarned: 0,
      pointsPossible: 5,
    };
  }

  const lower = spf.toLowerCase();
  // "?all" (neutral) and "+all" (pass anything) mean the record exists but
  // authorises the whole internet, which is no protection at all.
  const permissive = /[?+]all\s*$/.test(lower.trim());
  const softFail = /~all\s*$/.test(lower.trim());
  const hardFail = /-all\s*$/.test(lower.trim());

  if (permissive || (!softFail && !hardFail)) {
    return {
      checkId: 'dns.spf',
      category: 'email_dns',
      status: 'warn',
      severity: 'medium',
      title: 'SPF exists but does not restrict anything',
      detail:
        'The record is published but ends in a way that tells receiving servers to accept mail from any source. In practice this offers no more protection than having no record.',
      evidence: { record: spf },
      remediation: 'End the record with -all (strict) or ~all (soft fail).',
      pointsEarned: 2,
      pointsPossible: 5,
    };
  }

  return {
    checkId: 'dns.spf',
    category: 'email_dns',
    status: 'pass',
    severity: 'info',
    title: 'SPF is published and restrictive',
    detail: `Mail claiming to come from this domain is only accepted from the listed senders (${hardFail ? 'strict' : 'soft fail'}).`,
    evidence: { record: spf },
    pointsEarned: hardFail ? 5 : 4,
    pointsPossible: 5,
  };
}

function checkDmarc(dmarcRecords: string[]): Finding {
  const record = dmarcRecords.find((r) => r.toLowerCase().startsWith('v=dmarc1'));

  if (!record) {
    return {
      checkId: 'dns.dmarc',
      category: 'email_dns',
      status: 'fail',
      severity: 'high',
      title: 'No DMARC record',
      detail:
        'DMARC tells receiving mail servers what to do with mail that fails authentication, and sends you reports on who is sending as your domain. Without it, SPF failures are usually ignored rather than rejected, so spoofed mail still lands in inboxes.',
      remediation:
        'Publish a TXT record at _dmarc.<your-domain> starting at monitoring: v=DMARC1; p=none; rua=mailto:dmarc@<your-domain>. Move to p=quarantine, then p=reject, once the reports look clean.',
      pointsEarned: 0,
      pointsPossible: 6,
    };
  }

  const policy = record.match(/\bp\s*=\s*(none|quarantine|reject)/i)?.[1]?.toLowerCase();
  const hasReporting = /\brua\s*=/i.test(record);

  if (policy === 'reject' || policy === 'quarantine') {
    return {
      checkId: 'dns.dmarc',
      category: 'email_dns',
      status: 'pass',
      severity: 'info',
      title: `DMARC is enforcing (p=${policy})`,
      detail:
        policy === 'reject'
          ? 'Mail that fails authentication is rejected outright. This is the strongest setting.'
          : 'Mail that fails authentication is sent to spam. One step below the strongest setting.',
      evidence: { record, policy, reportingEnabled: hasReporting },
      remediation:
        policy === 'quarantine'
          ? 'Once the reports are clean, move to p=reject.'
          : undefined,
      pointsEarned: policy === 'reject' ? 6 : 5,
      pointsPossible: 6,
    };
  }

  return {
    checkId: 'dns.dmarc',
    category: 'email_dns',
    status: 'warn',
    severity: 'medium',
    title: 'DMARC is in monitor-only mode (p=none)',
    detail:
      'The record is published but tells receiving servers to take no action on mail that fails authentication. It collects reports, which is the right first step, but it does not yet stop anyone spoofing the domain.',
    evidence: { record, policy: policy ?? null, reportingEnabled: hasReporting },
    remediation:
      'Review the aggregate reports, then move the policy to p=quarantine and finally p=reject.',
    pointsEarned: 3,
    pointsPossible: 6,
  };
}

function checkCaa(caa: string[]): Finding {
  if (caa.length === 0) {
    return {
      checkId: 'dns.caa',
      category: 'email_dns',
      status: 'warn',
      severity: 'low',
      title: 'No CAA record',
      detail:
        'A CAA record names which certificate authorities are allowed to issue certificates for this domain. Without one, any public authority may issue a certificate for it, which widens the blast radius if a registrar or authority account is compromised.',
      remediation:
        'Publish a CAA record naming your authority, for example: 0 issue "letsencrypt.org"',
      pointsEarned: 0,
      pointsPossible: 4,
    };
  }

  return {
    checkId: 'dns.caa',
    category: 'email_dns',
    status: 'pass',
    severity: 'info',
    title: 'CAA record restricts who may issue certificates',
    detail:
      'Only the named certificate authorities can issue certificates for this domain.',
    evidence: { records: caa },
    pointsEarned: 4,
    pointsPossible: 4,
  };
}

export const dnsChecks: Check = (evidence): Finding[] => [
  checkSpf(evidence.dns.txt),
  checkDmarc(evidence.dns.dmarc),
  checkCaa(evidence.dns.caa),
];

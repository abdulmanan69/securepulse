import { env } from '@/lib/env';

import { contentChecks } from './checks/content';
import { cookieChecks } from './checks/cookies';
import { disclosureChecks } from './checks/disclosure';
import { dnsChecks } from './checks/dns';
import { exposureChecks, SENSITIVE_PATHS } from './checks/exposure';
import { headerChecks } from './checks/headers';
import { policyChecks } from './checks/policy';
import { transportChecks } from './checks/transport';
import {
  RequestBudget,
  collectDns,
  inspectTls,
  tryProbe,
} from './fetcher';
import { normalizeHostname } from './hostname';
import { scoreFindings, sortFindings } from './score';
import type { Check, ScanEvidence, ScanOutcome } from './types';

/**
 * Orchestrates a scan.
 *
 * Evidence is gathered once, up front, and then every check reads from that
 * single bundle. Checks are therefore pure and synchronous, which is what lets
 * the whole scoring system be tested against fixtures with no network at all.
 */

const CHECKS: Check[] = [
  transportChecks,
  headerChecks,
  cookieChecks,
  disclosureChecks,
  contentChecks,
  dnsChecks,
  policyChecks,
  exposureChecks,
];

export interface ScanOptions {
  /**
   * Ownership has been proven via DNS TXT. Unlocks requesting paths other
   * than the homepage.
   */
  verified?: boolean;
  /** Overrides the default request budget. */
  maxRequests?: number;
}

/**
 * Looks for files that should never be web-readable. A 200 alone proves
 * nothing, since many sites answer every path with a 200 and an HTML error
 * page, so the body must also match a signature specific to the real file.
 */
async function probeSensitivePaths(
  hostname: string,
  budget: RequestBudget,
): Promise<ScanEvidence['exposedPaths']> {
  const exposed: ScanEvidence['exposedPaths'] = [];

  for (const candidate of SENSITIVE_PATHS) {
    // Leave headroom so path discovery can never starve the core checks.
    if (budget.remaining <= 1) break;

    const response = await tryProbe(
      `https://${hostname}${candidate.path}`,
      budget,
      { followRedirects: false },
    );

    if (!response || response.status !== 200) continue;
    if (!candidate.signature.test(response.body)) continue;

    exposed.push({
      path: candidate.path,
      status: response.status,
      signature: candidate.signature.source,
    });
  }

  return exposed;
}

export async function gatherEvidence(
  rawHostname: string,
  options: ScanOptions = {},
): Promise<ScanEvidence> {
  const hostname = normalizeHostname(rawHostname);
  const budget = new RequestBudget(
    options.maxRequests ?? env.scanner.maxRequestsPerScan,
  );
  const warnings: string[] = [];

  // The homepage over both schemes, the certificate, and DNS, all at once.
  // These are independent, and running them in series would triple scan time
  // for no benefit.
  const [https, http, tls, dnsEvidence] = await Promise.all([
    tryProbe(`https://${hostname}/`, budget),
    tryProbe(`http://${hostname}/`, budget),
    inspectTls(hostname),
    collectDns(hostname),
  ]);

  if (!https) warnings.push('The site did not respond over HTTPS.');
  if (dnsEvidence.error) warnings.push(dnsEvidence.error);

  const securityTxtResponse =
    budget.remaining > 0
      ? await tryProbe(`https://${hostname}/.well-known/security.txt`, budget, {
          followRedirects: false,
        })
      : null;

  const securityTxtFound =
    securityTxtResponse?.status === 200 &&
    /contact\s*:/i.test(securityTxtResponse.body);

  const verified = options.verified === true;
  const exposedPaths = verified
    ? await probeSensitivePaths(hostname, budget)
    : [];

  return {
    hostname,
    https,
    http,
    tls,
    dns: dnsEvidence,
    securityTxt: {
      found: !!securityTxtFound,
      url: securityTxtFound
        ? `https://${hostname}/.well-known/security.txt`
        : null,
      status: securityTxtResponse?.status ?? null,
    },
    exposedPaths,
    verified,
    warnings,
  };
}

/** Runs every check over an evidence bundle. Pure, no network. */
export function evaluate(evidence: ScanEvidence) {
  const findings = sortFindings(CHECKS.flatMap((check) => check(evidence)));
  return { findings, ...scoreFindings(findings) };
}

export async function runScan(
  rawHostname: string,
  options: ScanOptions = {},
): Promise<ScanOutcome> {
  const startedAt = Date.now();
  const evidence = await gatherEvidence(rawHostname, options);
  const { findings, score, grade } = evaluate(evidence);

  return {
    hostname: evidence.hostname,
    score,
    grade,
    findings,
    evidence,
    durationMs: Date.now() - startedAt,
  };
}

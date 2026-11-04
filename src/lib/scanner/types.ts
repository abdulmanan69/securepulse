/**
 * Contracts shared by every check.
 *
 * A check is a pure-ish function: it receives an already-gathered evidence
 * bundle plus a budgeted fetcher, and returns findings. Checks never decide
 * the grade; scoring lives in score.ts so weights stay in one place.
 */

export type FindingStatus = 'pass' | 'warn' | 'fail' | 'info';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type CheckCategory =
  | 'transport'
  | 'headers'
  | 'cookies'
  | 'disclosure'
  | 'content'
  | 'email_dns'
  | 'policy'
  | 'exposure';

export interface Finding {
  /** Stable id, e.g. "headers.hsts". Used for trend comparison across scans. */
  checkId: string;
  category: CheckCategory;
  status: FindingStatus;
  severity: Severity;
  title: string;
  /** Plain English: what was found and why a non-specialist should care. */
  detail: string;
  /** Exactly what was observed. Never invented. */
  evidence?: Record<string, unknown>;
  remediation?: string;
  pointsEarned: number;
  pointsPossible: number;
  /**
   * Flat deduction applied after the weighted score. Used for findings that
   * should tank a grade outright (an exposed .env file) rather than cost a
   * proportional slice of one category.
   */
  penalty?: number;
}

export interface TlsInfo {
  protocol: string | null;
  cipher: string | null;
  subject: string | null;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysUntilExpiry: number | null;
  /** True when Node completed the handshake without an authorisation error. */
  authorized: boolean;
  authorizationError: string | null;
  altNames: string[];
  error?: string;
}

export interface HttpProbe {
  url: string;
  finalUrl: string;
  status: number;
  /** Header names are lower-cased. Repeated headers are joined with ", ". */
  headers: Record<string, string>;
  /** Raw Set-Cookie values, which must not be flattened into one string. */
  setCookie: string[];
  /** Truncated at the fetcher's body cap. Empty for HEAD-style probes. */
  body: string;
  redirectChain: string[];
  timingMs: number;
}

export interface DnsEvidence {
  a: string[];
  aaaa: string[];
  mx: string[];
  txt: string[];
  caa: string[];
  /** TXT records at _dmarc.<host>. */
  dmarc: string[];
  error?: string;
}

/**
 * Everything gathered from the network before any check runs. Collected once
 * so that N checks do not trigger N round trips.
 */
export interface ScanEvidence {
  hostname: string;
  /** https://<hostname>/ response, or null when HTTPS is unreachable. */
  https: HttpProbe | null;
  /** http://<hostname>/ response, used to test the upgrade to HTTPS. */
  http: HttpProbe | null;
  tls: TlsInfo | null;
  dns: DnsEvidence;
  securityTxt: { found: boolean; url: string | null; status: number | null };
  /** Only populated for DNS-verified domains. */
  exposedPaths: Array<{ path: string; status: number; signature: string }>;
  /** True when the caller proved control of the domain. */
  verified: boolean;
  /** Non-fatal problems worth surfacing, e.g. "IPv6 lookup failed". */
  warnings: string[];
}

export interface ScanOutcome {
  hostname: string;
  score: number;
  grade: string;
  findings: Finding[];
  evidence: ScanEvidence;
  durationMs: number;
}

export type Check = (evidence: ScanEvidence) => Finding[];

import net from 'node:net';

/**
 * Hostname parsing and SSRF protection.
 *
 * Users hand us an arbitrary hostname and the server then makes requests to
 * it. Without controls that is a server-side request forgery primitive: an
 * attacker points us at loopback, at private RFC1918 space, or at a cloud
 * metadata endpoint, and reads the response back through our own report UI.
 *
 * Defence is layered:
 *   1. Only real, public, registrable hostnames are accepted. Raw IP literals
 *      are rejected outright.
 *   2. Before any connection the hostname is resolved, and every returned
 *      address must be publicly routable.
 *   3. Redirects are followed manually so each hop is re-validated. A public
 *      host that redirects into link-local space does not get followed.
 */

const MAX_HOSTNAME_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;

/** Suffixes that never belong to a public internet host. */
const BLOCKED_SUFFIXES = [
  '.local',
  '.localhost',
  '.internal',
  '.intranet',
  '.corp',
  '.home',
  '.lan',
  '.home.arpa',
  '.test',
  '.invalid',
  '.example',
  '.onion',
];

const BLOCKED_EXACT = new Set(['localhost', 'local', 'broadcasthost']);

export class InvalidHostnameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHostnameError';
  }
}

export class BlockedHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedHostError';
  }
}

/**
 * Accepts what a user would realistically paste (with a scheme, a path, www,
 * a trailing slash, mixed case) and returns a bare lower-cased hostname.
 * Throws InvalidHostnameError on anything that is not a usable domain.
 */
export function normalizeHostname(raw: string): string {
  if (typeof raw !== 'string') {
    throw new InvalidHostnameError('Enter a domain name.');
  }

  let value = raw.trim().toLowerCase();
  if (value.length === 0) {
    throw new InvalidHostnameError('Enter a domain name.');
  }
  if (value.length > 2048) {
    throw new InvalidHostnameError('That value is too long to be a domain.');
  }

  // Strip a scheme if present, then let the URL parser handle path/port/auth.
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) {
    value = `https://${value}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InvalidHostnameError('That is not a valid domain name.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidHostnameError(
      'Only http and https addresses are supported.',
    );
  }

  // Embedded credentials are a classic way to disguise the real host.
  if (parsed.username || parsed.password) {
    throw new InvalidHostnameError('Remove the credentials from the address.');
  }

  let hostname = parsed.hostname.replace(/\.$/, '');

  // The URL parser brackets IPv6; strip that for the literal check below.
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  if (net.isIP(hostname) !== 0) {
    throw new InvalidHostnameError(
      'Enter a domain name rather than an IP address. Certificate and DNS checks need a domain.',
    );
  }

  if (hostname.length === 0 || hostname.length > MAX_HOSTNAME_LENGTH) {
    throw new InvalidHostnameError('That is not a valid domain name.');
  }

  // Internal and reserved names are rejected before the structural checks.
  // Otherwise a single-label name like "localhost" trips the "needs at least
  // two labels" rule first and reports a misleading error, and the caller
  // cannot distinguish "typo" from "you may not scan this".
  if (BLOCKED_EXACT.has(hostname)) {
    throw new BlockedHostError('Internal hostnames cannot be scanned.');
  }
  for (const suffix of BLOCKED_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new BlockedHostError(
        'Internal and reserved domains cannot be scanned.',
      );
    }
  }

  const labels = hostname.split('.');
  if (labels.length < 2) {
    throw new InvalidHostnameError(
      'Enter a full domain, for example example.com.',
    );
  }

  for (const label of labels) {
    if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
      throw new InvalidHostnameError('That is not a valid domain name.');
    }
    // Allows xn-- punycode, rejects underscores and other stray characters.
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) {
      throw new InvalidHostnameError('That is not a valid domain name.');
    }
  }

  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(tld) && !tld.startsWith('xn--')) {
    throw new InvalidHostnameError('That domain ending is not valid.');
  }

  return hostname;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inCidr(ipInt: number, base: string, prefix: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((baseInt & mask) >>> 0);
}

/** Non-publicly-routable IPv4 space, per RFC 1918 and RFC 6890. */
const RESERVED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // this network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, where cloud metadata services live
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes the broadcast address
];

/**
 * True when an address must never be connected to from the scanner.
 * Errs towards blocking: anything unparseable is treated as unsafe.
 */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);

  if (family === 4) {
    const ipInt = ipv4ToInt(address);
    if (ipInt === null) return true;
    return RESERVED_V4.some(([base, prefix]) => inCidr(ipInt, base, prefix));
  }

  if (family === 6) {
    const lower = address.toLowerCase();

    // IPv4-mapped and NAT64 forms smuggle a v4 address through a v6-shaped
    // string, so unwrap them and re-check against the v4 rules.
    const mapped = lower.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    const nat64 = lower.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
    if (nat64) return isBlockedAddress(nat64[1]);

    if (lower === '::' || lower === '::1') return true;
    // fc00::/7 unique-local, fe80::/10 link-local, ff00::/8 multicast.
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    if (/^ff[0-9a-f]{2}:/.test(lower)) return true;
    // Any other ::ffff: form, including the expanded notation.
    if (lower.startsWith('::ffff:')) return true;
    return false;
  }

  // Not a recognisable IP address at all.
  return true;
}

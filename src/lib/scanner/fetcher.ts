import dns from 'node:dns';
import type { LookupFunction } from 'node:net';
import dnsPromises from 'node:dns/promises';
import tls from 'node:tls';

import { Agent, request } from 'undici';

import { env } from '@/lib/env';
import { isBlockedAddress } from './hostname';
import type { DnsEvidence, HttpProbe, TlsInfo } from './types';

/**
 * The scanner network layer.
 *
 * Three jobs, all of them safety-critical:
 *   1. Never connect to a non-public address (SSRF).
 *   2. Never spend more requests, time, or bytes than the budget allows, so a
 *      single scan cannot be turned into a traffic amplifier.
 *   3. Gather evidence without ever sending a payload. Every request here is a
 *      plain GET that any browser or crawler would make.
 */

const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;

export class ScanBudgetExceededError extends Error {
  constructor() {
    super('Scan request budget exhausted.');
    this.name = 'ScanBudgetExceededError';
  }
}

export class UnsafeAddressError extends Error {
  constructor(target: string) {
    super(`Refusing to connect to ${target}: not a public address.`);
    this.name = 'UnsafeAddressError';
  }
}

/**
 * Hard ceiling on the number of HTTP requests one scan may issue. Shared by
 * every probe in that scan, redirect hops included.
 */
export class RequestBudget {
  private used = 0;

  constructor(private readonly limit: number) {}

  spend(): void {
    if (this.used >= this.limit) throw new ScanBudgetExceededError();
    this.used += 1;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  get spent(): number {
    return this.used;
  }
}

/**
 * DNS lookup that rejects non-public addresses at the moment of connection.
 *
 * This is deliberately wired into the connect path rather than performed as a
 * separate pre-flight check. A pre-flight resolve leaves a DNS-rebinding
 * window: the attacker answers the first lookup with a public address and the
 * second, the one the socket actually uses, with loopback. Validating inside
 * the lookup means the address that gets validated is the address that gets
 * connected to.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', 0);
      return;
    }

    const resolved = Array.isArray(addresses) ? addresses : [addresses];
    const safe = resolved.filter((entry) => !isBlockedAddress(entry.address));

    if (safe.length === 0) {
      callback(new UnsafeAddressError(hostname), '', 0);
      return;
    }

    if (options.all) {
      // Node overloads this callback on the `all` flag and the shared type
      // does not narrow on it, hence the cast.
      (callback as unknown as (e: null, a: typeof safe) => void)(null, safe);
      return;
    }

    callback(null, safe[0].address, safe[0].family);
  });
};

function createAgent(): Agent {
  return new Agent({
    // Cast: undici types `connect` as a union of socket option shapes, and
    // `lookup` is only visible on some of its members even though every one of
    // them forwards it straight to net.connect / tls.connect at runtime.
    connect: {
      lookup: guardedLookup,
      timeout: env.scanner.timeoutMs,
      // A security scanner must be able to reach, and then report on, a site
      // with an expired or mismatched certificate. Refusing the connection
      // would mean the worst-configured sites produce no findings at all.
      // Certificate validity is judged separately and authoritatively by
      // inspectTls(), which runs its own verified handshake.
      rejectUnauthorized: false,
    } as unknown as Agent.Options['connect'],
    headersTimeout: env.scanner.timeoutMs,
    bodyTimeout: env.scanner.timeoutMs,
    keepAliveTimeout: 1_000,
    keepAliveMaxTimeout: 5_000,
  });
}

function normalizeHeaders(
  raw: Record<string, string | string[] | undefined>,
): { headers: Record<string, string>; setCookie: string[] } {
  const headers: Record<string, string> = {};
  let setCookie: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const name = key.toLowerCase();
    if (name === 'set-cookie') {
      // Set-Cookie must stay a list. Joining it corrupts the attributes of
      // every cookie after the first.
      setCookie = Array.isArray(value) ? value : [value];
      continue;
    }
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }

  return { headers, setCookie };
}

async function readCappedBody(
  body: AsyncIterable<Buffer | Uint8Array>,
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (total + buffer.length > MAX_BODY_BYTES) {
      chunks.push(buffer.subarray(0, MAX_BODY_BYTES - total));
      break;
    }
    total += buffer.length;
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

export interface ProbeOptions {
  /** Read and return the response body. Off for existence checks. */
  readBody?: boolean;
  /** Follow 3xx responses, re-validating every hop. */
  followRedirects?: boolean;
}

/**
 * A single budgeted GET. Redirects are followed manually so that each hop goes
 * back through the guarded lookup rather than being resolved inside the
 * client own redirect handler.
 */
export async function probe(
  startUrl: string,
  budget: RequestBudget,
  options: ProbeOptions = {},
): Promise<HttpProbe> {
  const { readBody = true, followRedirects = true } = options;
  const agent = createAgent();
  const startedAt = Date.now();
  const redirectChain: string[] = [];

  let currentUrl = startUrl;
  let hops = 0;

  try {
    for (;;) {
      budget.spend();

      const response = await request(currentUrl, {
        method: 'GET',
        dispatcher: agent,
        headers: {
          'user-agent': env.scanner.userAgent,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
      });

      const { headers, setCookie } = normalizeHeaders(
        response.headers as Record<string, string | string[] | undefined>,
      );

      const isRedirect =
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        typeof headers.location === 'string';

      const finish = async (): Promise<HttpProbe> => {
        const body = readBody ? await readCappedBody(response.body) : '';
        if (!readBody) await response.body.dump();
        return {
          url: startUrl,
          finalUrl: currentUrl,
          status: response.statusCode,
          headers,
          setCookie,
          body,
          redirectChain,
          timingMs: Date.now() - startedAt,
        };
      };

      if (!isRedirect || !followRedirects || hops >= MAX_REDIRECTS) {
        return await finish();
      }

      // Drain so the socket can be reused rather than destroyed.
      await response.body.dump();
      redirectChain.push(currentUrl);

      let nextUrl: URL;
      try {
        nextUrl = new URL(headers.location as string, currentUrl);
      } catch {
        // A malformed Location is itself the end of the chain.
        return {
          url: startUrl,
          finalUrl: currentUrl,
          status: response.statusCode,
          headers,
          setCookie,
          body: '',
          redirectChain,
          timingMs: Date.now() - startedAt,
        };
      }

      if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
        throw new UnsafeAddressError(nextUrl.protocol);
      }

      currentUrl = nextUrl.toString();
      hops += 1;
    }
  } finally {
    await agent.close().catch(() => undefined);
  }
}

/** Same as probe(), but resolves to null instead of throwing on a network error. */
export async function tryProbe(
  url: string,
  budget: RequestBudget,
  options?: ProbeOptions,
): Promise<HttpProbe | null> {
  try {
    return await probe(url, budget, options);
  } catch {
    return null;
  }
}

/**
 * Performs a TLS handshake and reports what the certificate actually says.
 * Separate from probe() because this is where certificate validity is judged:
 * `authorized` records the verdict of Node own chain verification, which is
 * what makes the finding trustworthy even though the socket is allowed to
 * complete so that a broken certificate can still be described.
 */
export function inspectTls(hostname: string): Promise<TlsInfo> {
  return new Promise((resolve) => {
    const empty: TlsInfo = {
      protocol: null,
      cipher: null,
      subject: null,
      issuer: null,
      validFrom: null,
      validTo: null,
      daysUntilExpiry: null,
      authorized: false,
      authorizationError: null,
      altNames: [],
    };

    let settled = false;
    const finish = (info: TlsInfo) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(info);
    };

    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: false,
        lookup: guardedLookup as never,
        timeout: env.scanner.timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate(false);
        // Certificate DN fields are string | string[] depending on how many
        // values the issuer packed in; normalise to one readable string.
        const flat = (value: string | string[] | undefined): string | null =>
          Array.isArray(value) ? value.join(', ') : (value ?? null);
        const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
        const daysUntilExpiry =
          validTo && !Number.isNaN(validTo.getTime())
            ? Math.floor((validTo.getTime() - Date.now()) / 86_400_000)
            : null;

        finish({
          protocol: socket.getProtocol(),
          cipher: socket.getCipher()?.name ?? null,
          subject: flat(cert?.subject?.CN),
          issuer: flat(cert?.issuer?.O) ?? flat(cert?.issuer?.CN),
          validFrom: cert?.valid_from ?? null,
          validTo: cert?.valid_to ?? null,
          daysUntilExpiry,
          authorized: socket.authorized,
          authorizationError: socket.authorizationError
            ? String(socket.authorizationError)
            : null,
          altNames:
            typeof cert?.subjectaltname === 'string'
              ? cert.subjectaltname
                  .split(',')
                  .map((entry) => entry.trim().replace(/^DNS:/i, ''))
              : [],
        });
      },
    );

    socket.on('error', (error: Error) => finish({ ...empty, error: error.message }));
    socket.on('timeout', () => finish({ ...empty, error: 'TLS handshake timed out.' }));
  });
}

async function resolveSafely<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    // A missing record type is normal, not an error worth surfacing.
    return null;
  }
}

/** Collects every DNS record the checks need, in parallel, failing softly. */
export async function collectDns(hostname: string): Promise<DnsEvidence> {
  const resolver = new dnsPromises.Resolver({ timeout: env.scanner.timeoutMs, tries: 2 });

  const [a, aaaa, mx, txt, caa, dmarc] = await Promise.all([
    resolveSafely(() => resolver.resolve4(hostname)),
    resolveSafely(() => resolver.resolve6(hostname)),
    resolveSafely(() => resolver.resolveMx(hostname)),
    resolveSafely(() => resolver.resolveTxt(hostname)),
    resolveSafely(() => resolver.resolveCaa(hostname)),
    resolveSafely(() => resolver.resolveTxt(`_dmarc.${hostname}`)),
  ]);

  const flattenTxt = (records: string[][] | null): string[] =>
    (records ?? []).map((parts) => parts.join(''));

  return {
    a: a ?? [],
    aaaa: aaaa ?? [],
    mx: (mx ?? []).map((record) => `${record.priority} ${record.exchange}`),
    txt: flattenTxt(txt),
    caa: (caa ?? []).map((record) =>
      [record.critical, record.issue, record.issuewild, record.iodef]
        .filter(Boolean)
        .join(' '),
    ),
    dmarc: flattenTxt(dmarc),
    error: a === null && aaaa === null ? 'Domain did not resolve.' : undefined,
  };
}

/** Looks up TXT records for a single name. Used by domain verification. */
export async function lookupTxt(name: string): Promise<string[]> {
  const resolver = new dnsPromises.Resolver({ timeout: env.scanner.timeoutMs, tries: 2 });
  const records = await resolveSafely(() => resolver.resolveTxt(name));
  return (records ?? []).map((parts) => parts.join(''));
}

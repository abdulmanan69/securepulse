import 'server-only';

import { randomBytes } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { domains } from '@/lib/db/schema';
import { lookupTxt } from '@/lib/scanner/fetcher';

/**
 * Domain ownership verification.
 *
 * A DNS TXT record is the proof, because publishing one requires control of
 * the domain's DNS, which is exactly the authority we need before requesting
 * paths beyond the homepage. A file uploaded to the web root would be weaker:
 * on shared hosting or a CMS, plenty of people can write a file who have no
 * business authorising a scan.
 */

export const TXT_RECORD_PREFIX = 'securepulse-site-verification=';
export const TXT_RECORD_HOST = '_securepulse';

export function generateVerificationToken(): string {
  return randomBytes(16).toString('hex');
}

export function expectedTxtValue(token: string): string {
  return `${TXT_RECORD_PREFIX}${token}`;
}

export interface VerificationResult {
  verified: boolean;
  checkedNames: string[];
  foundRecords: string[];
}

/**
 * Looks for the token at both the domain root and at _securepulse.<domain>.
 * Root TXT records are where most people put verification strings, but some
 * DNS providers make a subdomain easier, and a root record can collide with
 * SPF. Accepting either removes the most common support ticket.
 */
export async function checkDomainVerification(
  hostname: string,
  token: string,
): Promise<VerificationResult> {
  const expected = expectedTxtValue(token);
  const names = [hostname, `${TXT_RECORD_HOST}.${hostname}`];

  const results = await Promise.all(names.map((name) => lookupTxt(name)));
  const records = results.flat();

  return {
    verified: records.some((record) => record.trim() === expected),
    checkedNames: names,
    foundRecords: records.slice(0, 20),
  };
}

export async function markDomainVerified(domainId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(domains)
    .set({ verifiedAt: new Date() })
    .where(eq(domains.id, domainId));
}

/**
 * Fetches a domain, scoped to its owner.
 *
 * Every route that touches a domain goes through this. Taking the userId as a
 * required argument makes it impossible to write a handler that looks up by id
 * alone and accidentally lets one account read another's data.
 */
export async function getOwnedDomain(userId: string, domainId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

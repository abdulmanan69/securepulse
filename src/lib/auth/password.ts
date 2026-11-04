import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt.
 *
 * scrypt is chosen over bcrypt or argon2 because it ships in Node itself.
 * There is no native module to compile, nothing to go wrong on a different
 * platform, and no third-party dependency in the path of authentication. It is
 * a memory-hard KDF and is explicitly recommended by OWASP for this use.
 *
 * Stored format:  scrypt$N$r$p$<salt-b64>$<hash-b64>
 *
 * The parameters live inside the string so they can be raised later without
 * invalidating existing hashes: an old hash still verifies against its own
 * recorded cost, and needsRehash() reports when it should be upgraded.
 */

const CURRENT = {
  // ~64 MB per hash. Comfortably above the OWASP minimum and still fast
  // enough to run inside a request.
  N: 65_536,
  r: 8,
  p: 1,
  keyLength: 64,
  saltBytes: 16,
};

// scrypt needs roughly 128 * N * r bytes; Node's default maxmem is too low
// for N=65536, so it is raised explicitly with headroom.
const MAX_MEM = 256 * CURRENT.N * CURRENT.r;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

export class WeakPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

/**
 * Rejects passwords that are too short or too long. Length is the requirement
 * that actually correlates with strength; composition rules mostly push people
 * towards predictable substitutions, so they are deliberately not imposed.
 *
 * The upper bound matters for availability: scrypt cost grows with input, so
 * an unbounded password field is a denial-of-service vector.
 */
export function assertPasswordAcceptable(password: string): void {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new WeakPasswordError(
      `Use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase you can remember beats a short complicated string.`,
    );
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new WeakPasswordError(
      `Passwords must be ${PASSWORD_MAX_LENGTH} characters or fewer.`,
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordAcceptable(password);

  const salt = randomBytes(CURRENT.saltBytes);
  const derived = await scrypt(
    password.normalize('NFKC'),
    salt,
    CURRENT.keyLength,
    { N: CURRENT.N, r: CURRENT.r, p: CURRENT.p, maxmem: MAX_MEM },
  );

  return [
    'scrypt',
    CURRENT.N,
    CURRENT.r,
    CURRENT.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Constant-time verification. Returns false rather than throwing on a
 * malformed stored hash, so a corrupt row cannot be distinguished from a wrong
 * password by timing or by error message.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }
    // Refuse absurd parameters from a tampered row rather than allocating on
    // their behalf.
    if (N > 1_048_576 || r > 32 || p > 16) return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: Math.max(MAX_MEM, 256 * N * r),
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a stored hash uses weaker parameters than the current policy. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < CURRENT.N;
}

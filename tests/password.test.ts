import { describe, expect, it } from 'vitest';

import {
  WeakPasswordError,
  assertPasswordAcceptable,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@/lib/auth/password';

describe('password hashing', () => {
  it('produces a self-describing hash that verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$65536$8$1$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('salts, so the same password never produces the same hash', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse battery staple', b)).toBe(true);
  });

  it('normalises unicode so an equivalent password still verifies', async () => {
    // Same text, composed vs decomposed. A user switching input method must
    // not be locked out.
    const composed = 'caf\u00e9 passphrase long';
    const decomposed = 'cafe\u0301 passphrase long';
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it('enforces a minimum length', () => {
    expect(() => assertPasswordAcceptable('short')).toThrow(WeakPasswordError);
    expect(() => assertPasswordAcceptable('exactly12chr')).not.toThrow();
  });

  it('enforces a maximum length, because scrypt cost scales with input', () => {
    expect(() => assertPasswordAcceptable('a'.repeat(201))).toThrow(
      WeakPasswordError,
    );
  });

  it('returns false rather than throwing on a malformed stored hash', async () => {
    for (const bad of [
      '',
      'not-a-hash',
      'scrypt$1$2$3',
      'bcrypt$65536$8$1$aaaa$bbbb',
      'scrypt$abc$8$1$aaaa$bbbb',
    ]) {
      expect(await verifyPassword('correct horse battery staple', bad)).toBe(false);
    }
  });

  it('refuses absurd parameters from a tampered row', async () => {
    // A row edited to demand enormous memory would otherwise let one login
    // attempt exhaust the process.
    const hostile = 'scrypt$99999999$999$999$aaaa$bbbb';
    expect(await verifyPassword('correct horse battery staple', hostile)).toBe(false);
  });

  it('flags hashes weaker than the current policy for upgrade', async () => {
    expect(needsRehash(await hashPassword('correct horse battery staple'))).toBe(false);
    expect(needsRehash('scrypt$16384$8$1$aaaa$bbbb')).toBe(true);
    expect(needsRehash('garbage')).toBe(true);
  });
});

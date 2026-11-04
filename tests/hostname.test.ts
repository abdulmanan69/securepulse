import { describe, expect, it } from 'vitest';

import {
  BlockedHostError,
  InvalidHostnameError,
  isBlockedAddress,
  normalizeHostname,
} from '@/lib/scanner/hostname';

describe('normalizeHostname', () => {
  it('accepts what a user actually pastes', () => {
    expect(normalizeHostname('example.com')).toBe('example.com');
    expect(normalizeHostname('  Example.COM  ')).toBe('example.com');
    expect(normalizeHostname('https://www.example.com/pricing?a=1')).toBe(
      'www.example.com',
    );
    expect(normalizeHostname('http://sub.domain.example.co.uk:8443/x')).toBe(
      'sub.domain.example.co.uk',
    );
    expect(normalizeHostname('example.com.')).toBe('example.com');
  });

  it('keeps punycode domains', () => {
    expect(normalizeHostname('xn--bcher-kva.de')).toBe('xn--bcher-kva.de');
  });

  it('rejects input that is not a domain', () => {
    for (const bad of ['', '   ', 'not a domain', 'com', 'exa mple.com']) {
      expect(() => normalizeHostname(bad)).toThrow(InvalidHostnameError);
    }
  });

  it('rejects IP literals, which would bypass the domain checks', () => {
    for (const bad of ['127.0.0.1', '8.8.8.8', 'http://10.0.0.1/', '[::1]']) {
      expect(() => normalizeHostname(bad)).toThrow();
    }
  });

  it('rejects non-http schemes', () => {
    for (const bad of ['file:///etc/passwd', 'gopher://example.com/']) {
      expect(() => normalizeHostname(bad)).toThrow(InvalidHostnameError);
    }
  });

  it('rejects embedded credentials used to disguise the real host', () => {
    expect(() => normalizeHostname('https://example.com@evil.test/')).toThrow(
      InvalidHostnameError,
    );
  });

  it('rejects internal and reserved suffixes', () => {
    for (const bad of [
      'localhost',
      'router.local',
      'db.internal',
      'thing.home.arpa',
      'site.onion',
    ]) {
      expect(() => normalizeHostname(bad)).toThrow(BlockedHostError);
    }
  });
});

describe('isBlockedAddress', () => {
  it('blocks loopback', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('127.255.255.254')).toBe(true);
    expect(isBlockedAddress('::1')).toBe(true);
  });

  it('blocks the cloud metadata endpoint', () => {
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
  });

  it('blocks RFC1918 private space', () => {
    expect(isBlockedAddress('10.0.0.1')).toBe(true);
    expect(isBlockedAddress('172.16.0.1')).toBe(true);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('192.168.1.1')).toBe(true);
  });

  it('allows the addresses either side of a private range', () => {
    expect(isBlockedAddress('172.15.255.255')).toBe(false);
    expect(isBlockedAddress('172.32.0.0')).toBe(false);
    expect(isBlockedAddress('9.255.255.255')).toBe(false);
    expect(isBlockedAddress('11.0.0.0')).toBe(false);
  });

  it('blocks carrier-grade NAT, multicast and reserved space', () => {
    expect(isBlockedAddress('100.64.0.1')).toBe(true);
    expect(isBlockedAddress('224.0.0.1')).toBe(true);
    expect(isBlockedAddress('255.255.255.255')).toBe(true);
    expect(isBlockedAddress('0.0.0.0')).toBe(true);
  });

  it('unwraps IPv4-mapped IPv6 rather than trusting the v6 shape', () => {
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedAddress('64:ff9b::10.0.0.1')).toBe(true);
  });

  it('blocks IPv6 unique-local, link-local and multicast', () => {
    expect(isBlockedAddress('fc00::1')).toBe(true);
    expect(isBlockedAddress('fd12:3456::1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('ff02::1')).toBe(true);
  });

  it('allows ordinary public addresses', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('treats anything unparseable as unsafe', () => {
    expect(isBlockedAddress('')).toBe(true);
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('999.999.999.999')).toBe(true);
  });
});

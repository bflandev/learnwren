import { describe, expect, it } from 'vitest';

import { readTrustProxyHops } from './trust-proxy';

describe('readTrustProxyHops', () => {
  it('defaults to one hop (Firebase Hosting, or nginx alone in front)', () => {
    expect(readTrustProxyHops({})).toBe(1);
    expect(readTrustProxyHops({ LEARNWREN_TRUST_PROXY_HOPS: ' ' })).toBe(1);
  });

  it('reads the hop count, e.g. 2 behind a TLS proxy in front of the bundled nginx', () => {
    expect(readTrustProxyHops({ LEARNWREN_TRUST_PROXY_HOPS: '2' })).toBe(2);
    expect(readTrustProxyHops({ LEARNWREN_TRUST_PROXY_HOPS: '0' })).toBe(0);
  });

  it.each(['true', '-1', '1.5', 'two', '1e3'])('refuses to start on %j', (raw) => {
    expect(() => readTrustProxyHops({ LEARNWREN_TRUST_PROXY_HOPS: raw })).toThrow(
      /LEARNWREN_TRUST_PROXY_HOPS/,
    );
  });
});

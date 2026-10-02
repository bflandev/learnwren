import { newOpaqueToken, sha256Hex } from './opaque-token';

describe('opaque tokens', () => {
  it('are 32 random bytes in base64url (43 chars) and never repeat', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newOpaqueToken()));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('sha256Hex is the lower-case hex SHA-256', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

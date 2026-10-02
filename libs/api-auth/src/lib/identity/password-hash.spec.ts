import { dummyPasswordHash, hashPassword, verifyPasswordHash } from './password-hash';

describe('password hashing (scrypt)', () => {
  it('stores scrypt parameters, a 16-byte salt and a 64-byte key', async () => {
    const stored = await hashPassword('Correct-Horse-9-battery');
    const [scheme, n, r, p, salt, key] = stored.split('$');
    expect([scheme, n, r, p]).toEqual(['scrypt', '32768', '8', '1']);
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(key, 'base64')).toHaveLength(64);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('Correct-Horse-9-battery');
    expect(await verifyPasswordHash('Correct-Horse-9-battery', stored)).toBe(true);
    expect(await verifyPasswordHash('correct-horse-9-battery', stored)).toBe(false);
  });

  it('salts: the same password hashes differently each time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('honours the parameters stored with the hash', async () => {
    const stored = await hashPassword('p');
    const [, , , , salt, key] = stored.split('$');
    // Same salt+key under different stored params must not verify.
    expect(await verifyPasswordHash('p', `scrypt$16384$8$1$${salt}$${key}`)).toBe(false);
  });

  it('rejects a hash with the right data but the wrong field count or scheme', async () => {
    const stored = await hashPassword('Correct-Horse-9-battery');
    const [scheme, n, r, p, salt, key] = stored.split('$');
    // Same real salt+key that WOULD verify if the shape guard were skipped.
    expect(await verifyPasswordHash('Correct-Horse-9-battery', `${stored}$extra`)).toBe(false);
    expect(
      await verifyPasswordHash('Correct-Horse-9-battery', [`x${scheme}`, n, r, p, salt, key].join('$')),
    ).toBe(false);
  });

  it('returns false (never throws) for malformed stored hashes', async () => {
    for (const bad of ['', 'scrypt$1$2', 'bcrypt$32768$8$1$a$b', 'scrypt$x$8$1$AAAA$AAAA', 'scrypt$32768$8$1$AAAA$']) {
      expect(await verifyPasswordHash('p', bad)).toBe(false);
    }
  });

  it('memoises a dummy hash that never matches a user password', async () => {
    const dummy = await dummyPasswordHash();
    expect(dummy).toBe(await dummyPasswordHash());
    expect(await verifyPasswordHash('Correct-Horse-9-battery', dummy)).toBe(false);
  });
});

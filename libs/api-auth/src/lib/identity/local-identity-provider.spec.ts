import { Logger } from '@nestjs/common';
import { createInMemoryDocumentStore } from '@learnwren/api-document-store';

import { EmailActionInvalidError } from './identity.errors';
import { SESSION_MAX_AGE_SECONDS } from './identity-provider.port';
import { sha256Hex } from './opaque-token';
import * as passwordHash from './password-hash';
import { EMAIL_ACTION_TTL_MS, LocalIdentityProvider } from './local-identity-provider';

vi.mock('./password-hash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./password-hash')>();
  return { ...actual, verifyPasswordHash: vi.fn(actual.verifyPasswordHash) };
});

const PASSWORD = 'Correct-Horse-9-battery';
const HEX_64 = /^[0-9a-f]{64}$/;

describe('LocalIdentityProvider', () => {
  let t = 1_000_000;
  let store: ReturnType<typeof createInMemoryDocumentStore>;
  let idp: LocalIdentityProvider;

  beforeEach(() => {
    t = 1_000_000;
    store = createInMemoryDocumentStore();
    idp = new LocalIdentityProvider(store, () => t);
    vi.clearAllMocks();
  });

  describe('at rest', () => {
    it('stores no raw token under authSessions or authEmailActions', async () => {
      const uid = await idp.createUser({ email: 'ada@example.test', password: PASSWORD, displayName: 'Ada' });
      const session = await idp.createSession(await idp.verifyPassword('ada@example.test', PASSWORD));
      const link = await idp.createEmailActionLink('verify-email', 'ada@example.test', '/login');
      const actionToken = new URL(link).searchParams.get('token') ?? '';

      for (const [path, data] of store.__store) {
        if (path.startsWith('authSessions/') || path.startsWith('authEmailActions/')) {
          const key = path.split('/')[1] ?? '';
          expect(key).toMatch(HEX_64);
        }
        expect(JSON.stringify(data)).not.toContain(session.token);
        expect(JSON.stringify(data)).not.toContain(actionToken);
      }
      expect(uid).not.toBe('');
    });

    it('stores the password hash as scrypt$..., never the raw password', async () => {
      await idp.createUser({ email: 'bob@example.test', password: PASSWORD, displayName: 'Bob' });
      const [, data] = [...store.__store].find(([path]) => path.startsWith('authUsers/')) ?? [];
      const passwordHashValue = (data as { passwordHash: string }).passwordHash;
      expect(passwordHashValue.startsWith('scrypt$')).toBe(true);
      expect(passwordHashValue).not.toContain(PASSWORD);
    });

    it('keys the email index by sha256Hex of the lower-cased email', async () => {
      await idp.createUser({ email: 'Carol@Example.Test', password: PASSWORD, displayName: 'Carol' });
      const expectedKey = `authEmails/${sha256Hex('carol@example.test')}`;
      expect(store.__store.has(expectedKey)).toBe(true);
    });
  });

  describe('expiry', () => {
    it('rejects a session after SESSION_MAX_AGE_SECONDS * 1000 ms, accepts just before', async () => {
      await idp.createUser({ email: 'dana@example.test', password: PASSWORD, displayName: 'Dana' });
      const session = await idp.createSession(await idp.verifyPassword('dana@example.test', PASSWORD));

      t += SESSION_MAX_AGE_SECONDS * 1000 - 1;
      expect(await idp.verifySession(session.token)).not.toBeNull();

      t += 1;
      expect(await idp.verifySession(session.token)).toBeNull();
    });

    it.each(['verify-email', 'reset-password', 'change-email'] as const)(
      'rejects the %s action token after its TTL, accepts just before',
      async (kind) => {
        let address = 'elle@example.test';
        await idp.createUser({ email: address, password: PASSWORD, displayName: 'Elle' });
        const extraArg = kind === 'reset-password' ? 'Brand-New-Pass-42!' : undefined;

        // Token A: applied with 1ms left on its TTL — must succeed.
        const linkA = await idp.createEmailActionLink(kind, address, '/x', kind === 'change-email' ? 'elle-a@example.test' : undefined);
        const tokenA = new URL(linkA).searchParams.get('token') ?? '';
        t += EMAIL_ACTION_TTL_MS[kind] - 1;
        await expect(idp.applyEmailAction(kind, tokenA, extraArg)).resolves.toBeUndefined();
        if (kind === 'change-email') address = 'elle-a@example.test';

        // Token B: minted after A, applied 1ms past its own TTL — must reject.
        const linkB = await idp.createEmailActionLink(kind, address, '/x', kind === 'change-email' ? 'elle-b@example.test' : undefined);
        const tokenB = new URL(linkB).searchParams.get('token') ?? '';
        t += EMAIL_ACTION_TTL_MS[kind] + 1;
        await expect(idp.applyEmailAction(kind, tokenB, extraArg)).rejects.toBeInstanceOf(EmailActionInvalidError);
      },
    );
  });

  describe('proofs and deletion', () => {
    it('a proof cannot mint two sessions', async () => {
      await idp.createUser({ email: 'finn@example.test', password: PASSWORD, displayName: 'Finn' });
      const proof = await idp.verifyPassword('finn@example.test', PASSWORD);
      await idp.createSession(proof);
      await expect(idp.createSession(proof)).rejects.toThrow();
    });

    it('deleteUser removes the email index so the address can be registered again', async () => {
      const uid = await idp.createUser({ email: 'gail@example.test', password: PASSWORD, displayName: 'Gail' });
      await idp.deleteUser(uid);
      const newUid = await idp.createUser({ email: 'gail@example.test', password: PASSWORD, displayName: 'Gail 2' });
      expect(newUid).not.toBe(uid);
    });
  });

  describe('links', () => {
    const ORIGINAL_PUBLIC_URL = process.env['LEARNWREN_PUBLIC_URL'];

    afterEach(() => {
      if (ORIGINAL_PUBLIC_URL === undefined) delete process.env['LEARNWREN_PUBLIC_URL'];
      else process.env['LEARNWREN_PUBLIC_URL'] = ORIGINAL_PUBLIC_URL;
    });

    it('carries publicUrl(/auth/action) with mode and token params', async () => {
      process.env['LEARNWREN_PUBLIC_URL'] = 'https://learn.example.test';
      await idp.createUser({ email: 'harry@example.test', password: PASSWORD, displayName: 'Harry' });
      const link = await idp.createEmailActionLink('verify-email', 'harry@example.test', '/login');
      const url = new URL(link);
      expect(`${url.origin}${url.pathname}`).toBe('https://learn.example.test/auth/action');
      expect(url.searchParams.get('mode')).toBe('verify-email');
      expect(url.searchParams.get('token')).toBeTruthy();
    });
  });

  describe('timing guard', () => {
    it('verifyPassword for an unknown email hashes against the dummy hash', async () => {
      const dummy = await passwordHash.dummyPasswordHash();
      await expect(idp.verifyPassword('nobody@example.test', PASSWORD)).rejects.toThrow();
      expect(passwordHash.verifyPasswordHash).toHaveBeenCalledWith(PASSWORD, dummy);
    });

    it('warms the dummy password hash on construction, so the first unknown-email login is not the slow one', async () => {
      const spy = vi.spyOn(passwordHash, 'dummyPasswordHash');
      new LocalIdentityProvider(store, () => t);
      await Promise.resolve();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('logs instead of throwing when the constructor-time dummy-hash warm-up rejects', async () => {
      const spy = vi
        .spyOn(passwordHash, 'dummyPasswordHash')
        .mockRejectedValueOnce(new Error('boom'));
      const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      expect(() => new LocalIdentityProvider(store, () => t)).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('failed to warm dummy password hash'));
      spy.mockRestore();
      loggerSpy.mockRestore();
    });
  });
});

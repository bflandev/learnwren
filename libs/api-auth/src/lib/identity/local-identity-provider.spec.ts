import { Logger } from '@nestjs/common';
import { createInMemoryDocumentStore } from '@learnwren/api-document-store';

import { EmailActionInvalidError, EmailInUseError } from './identity.errors';
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

  describe('session and action edge cases', () => {
    it('TTLs are exactly 24h for verify-email and 1h for reset-password and change-email', () => {
      expect(EMAIL_ACTION_TTL_MS['verify-email']).toBe(24 * 60 * 60 * 1000);
      expect(EMAIL_ACTION_TTL_MS['reset-password']).toBe(60 * 60 * 1000);
      expect(EMAIL_ACTION_TTL_MS['change-email']).toBe(60 * 60 * 1000);
    });

    it('a second createSession on the same proof rejects with the exact "not issued" message', async () => {
      await idp.createUser({ email: 'ivy@example.test', password: PASSWORD, displayName: 'Ivy' });
      const proof = await idp.verifyPassword('ivy@example.test', PASSWORD);
      await idp.createSession(proof);
      await expect(idp.createSession(proof)).rejects.toThrow('Password proof was not issued by this identity provider');
    });

    it('verifySession returns null when the session is valid but the user was deleted', async () => {
      const uid = await idp.createUser({ email: 'jack@example.test', password: PASSWORD, displayName: 'Jack' });
      const session = await idp.createSession(await idp.verifyPassword('jack@example.test', PASSWORD));
      await idp.deleteUser(uid);
      expect(await idp.verifySession(session.token)).toBeNull();
    });

    it('a session expiring exactly now is rejected (boundary is <=, not <)', async () => {
      await idp.createUser({ email: 'kim@example.test', password: PASSWORD, displayName: 'Kim' });
      const session = await idp.createSession(await idp.verifyPassword('kim@example.test', PASSWORD));
      t += SESSION_MAX_AGE_SECONDS * 1000; // land exactly on expiresAt
      expect(await idp.verifySession(session.token)).toBeNull();
    });

    it('createEmailActionLink("change-email") without newEmail rejects with the exact message', async () => {
      await idp.createUser({ email: 'lee@example.test', password: PASSWORD, displayName: 'Lee' });
      await expect(idp.createEmailActionLink('change-email', 'lee@example.test', '/x')).rejects.toThrow(
        'change-email requires newEmail',
      );
    });

    it('createEmailActionLink for an unknown email rejects with the exact message', async () => {
      await expect(idp.createEmailActionLink('verify-email', 'nobody@example.test', '/login')).rejects.toThrow(
        'No account for that email',
      );
    });

    it('applyEmailAction("reset-password") with no newPassword rejects with EmailActionInvalidError, not a hashing error', async () => {
      await idp.createUser({ email: 'mona@example.test', password: PASSWORD, displayName: 'Mona' });
      const link = await idp.createEmailActionLink('reset-password', 'mona@example.test', '/x');
      const token = new URL(link).searchParams.get('token') ?? '';
      await expect(idp.applyEmailAction('reset-password', token)).rejects.toBeInstanceOf(EmailActionInvalidError);
    });

    it('applyEmailAction rejects when the account is deleted after the link was sent', async () => {
      const uid = await idp.createUser({ email: 'nora@example.test', password: PASSWORD, displayName: 'Nora' });
      const link = await idp.createEmailActionLink('verify-email', 'nora@example.test', '/login');
      const token = new URL(link).searchParams.get('token') ?? '';
      await idp.deleteUser(uid);
      await expect(idp.applyEmailAction('verify-email', token)).rejects.toBeInstanceOf(EmailActionInvalidError);
    });

    it('a change-email target taken between link creation and redemption raises EmailInUseError', async () => {
      await idp.createUser({ email: 'owen@example.test', password: PASSWORD, displayName: 'Owen' });
      const link = await idp.createEmailActionLink('change-email', 'owen@example.test', '/x', 'taken@example.test');
      const token = new URL(link).searchParams.get('token') ?? '';
      await idp.createUser({ email: 'taken@example.test', password: PASSWORD, displayName: 'Taken' });
      await expect(idp.applyEmailAction('change-email', token)).rejects.toBeInstanceOf(EmailInUseError);
    });

    it('an email-action token expiring exactly now is rejected (boundary is <=, not <)', async () => {
      await idp.createUser({ email: 'quinn@example.test', password: PASSWORD, displayName: 'Quinn' });
      const link = await idp.createEmailActionLink('verify-email', 'quinn@example.test', '/login');
      const token = new URL(link).searchParams.get('token') ?? '';
      t += EMAIL_ACTION_TTL_MS['verify-email']; // land exactly on expiresAt
      await expect(idp.applyEmailAction('verify-email', token)).rejects.toBeInstanceOf(EmailActionInvalidError);
    });

    it('verifySession returns null for a session whose user doc vanished without session cleanup', async () => {
      const uid = await idp.createUser({ email: 'orphan@example.test', password: PASSWORD, displayName: 'Orphan' });
      const session = await idp.createSession(await idp.verifyPassword('orphan@example.test', PASSWORD));
      store.__store.delete(`authUsers/${uid}`);
      expect(await idp.verifySession(session.token)).toBeNull();
    });

    it('applyEmailAction hashes newPassword only for reset-password', async () => {
      await idp.createUser({ email: 'rex@example.test', password: PASSWORD, displayName: 'Rex' });
      const link = await idp.createEmailActionLink('verify-email', 'rex@example.test', '/login');
      const spy = vi.spyOn(passwordHash, 'hashPassword');
      await idp.applyEmailAction('verify-email', new URL(link).searchParams.get('token') ?? '', 'Ignored-Pass-42!');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    const tokenOf = (link: string): string => new URL(link).searchParams.get('token') ?? '';

    it('change-email ends every session of the account', async () => {
      await idp.createUser({ email: 'sam@example.test', password: PASSWORD, displayName: 'Sam' });
      const session = await idp.createSession(await idp.verifyPassword('sam@example.test', PASSWORD));
      const link = await idp.createEmailActionLink('change-email', 'sam@example.test', '/x', 'sam2@example.test');
      await idp.applyEmailAction('change-email', tokenOf(link));
      expect(await idp.verifySession(session.token)).toBeNull();
    });

    it('a password reset cancels a pending change-email link', async () => {
      await idp.createUser({ email: 'tara@example.test', password: PASSWORD, displayName: 'Tara' });
      const change = await idp.createEmailActionLink('change-email', 'tara@example.test', '/x', 'evil@example.test');
      const reset = await idp.createEmailActionLink('reset-password', 'tara@example.test', '/x');
      await idp.applyEmailAction('reset-password', tokenOf(reset), 'Brand-New-Pass-42!');
      await expect(idp.applyEmailAction('change-email', tokenOf(change))).rejects.toBeInstanceOf(EmailActionInvalidError);
    });

    it('a password change cancels pending change-email and reset-password links but not verify-email', async () => {
      const uid = await idp.createUser({ email: 'uma@example.test', password: PASSWORD, displayName: 'Uma' });
      const change = await idp.createEmailActionLink('change-email', 'uma@example.test', '/x', 'evil@example.test');
      const reset = await idp.createEmailActionLink('reset-password', 'uma@example.test', '/x');
      const verify = await idp.createEmailActionLink('verify-email', 'uma@example.test', '/login');
      await idp.updateUser(uid, { password: 'Brand-New-Pass-42!' });
      await expect(idp.applyEmailAction('change-email', tokenOf(change))).rejects.toBeInstanceOf(EmailActionInvalidError);
      await expect(idp.applyEmailAction('reset-password', tokenOf(reset), 'Other-New-Pass-42!')).rejects.toBeInstanceOf(
        EmailActionInvalidError,
      );
      await expect(idp.applyEmailAction('verify-email', tokenOf(verify))).resolves.toBeUndefined();
    });

    it('updateUser without a password leaves pending links alone', async () => {
      const uid = await idp.createUser({ email: 'vic@example.test', password: PASSWORD, displayName: 'Vic' });
      const change = await idp.createEmailActionLink('change-email', 'vic@example.test', '/x', 'vic2@example.test');
      await idp.updateUser(uid, { emailVerified: true });
      await expect(idp.applyEmailAction('change-email', tokenOf(change))).resolves.toBeUndefined();
    });

    it('two concurrent redemptions of one link: exactly one wins, the other gets EmailActionInvalidError', async () => {
      await idp.createUser({ email: 'wes@example.test', password: PASSWORD, displayName: 'Wes' });
      const token = tokenOf(await idp.createEmailActionLink('verify-email', 'wes@example.test', '/login'));
      const results = await Promise.allSettled([
        idp.applyEmailAction('verify-email', token),
        idp.applyEmailAction('verify-email', token),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(EmailActionInvalidError);
    });

    it('reset-password with an unknown token never runs scrypt', async () => {
      const spy = vi.spyOn(passwordHash, 'hashPassword');
      await expect(idp.applyEmailAction('reset-password', 'junk', 'Brand-New-Pass-42!')).rejects.toBeInstanceOf(
        EmailActionInvalidError,
      );
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('verify-email leaves existing sessions and pending reset-password links untouched', async () => {
      await idp.createUser({ email: 'pia@example.test', password: PASSWORD, displayName: 'Pia' });
      const session = await idp.createSession(await idp.verifyPassword('pia@example.test', PASSWORD));
      const resetLink = await idp.createEmailActionLink('reset-password', 'pia@example.test', '/x');
      const resetToken = new URL(resetLink).searchParams.get('token') ?? '';
      const verifyLink = await idp.createEmailActionLink('verify-email', 'pia@example.test', '/login');
      await idp.applyEmailAction('verify-email', new URL(verifyLink).searchParams.get('token') ?? '');

      expect(await idp.verifySession(session.token)).not.toBeNull();
      await expect(
        idp.applyEmailAction('reset-password', resetToken, 'Brand-New-Pass-42!'),
      ).resolves.toBeUndefined();
    });
  });
  describe('housekeeping', () => {
    const countIn = (collection: string): number =>
      [...store.__store.keys()].filter((path) => path.startsWith(`${collection}/`)).length;
    const login = async (email: string) => idp.createSession(await idp.verifyPassword(email, PASSWORD));

    it("a new login removes that user's expired sessions and keeps live ones", async () => {
      await idp.createUser({ email: 'xan@example.test', password: PASSWORD, displayName: 'Xan' });
      await login('xan@example.test');
      t += SESSION_MAX_AGE_SECONDS * 1000; // first session now expired
      const live = await login('xan@example.test');
      expect(countIn('authSessions')).toBe(1);
      const third = await login('xan@example.test');
      expect(countIn('authSessions')).toBe(2);
      expect(await idp.verifySession(live.token)).not.toBeNull();
      expect(await idp.verifySession(third.token)).not.toBeNull();
    });

    it("a new login leaves other users' expired sessions alone", async () => {
      await idp.createUser({ email: 'yul@example.test', password: PASSWORD, displayName: 'Yul' });
      await idp.createUser({ email: 'zed@example.test', password: PASSWORD, displayName: 'Zed' });
      await login('yul@example.test');
      t += SESSION_MAX_AGE_SECONDS * 1000;
      await login('zed@example.test');
      expect(countIn('authSessions')).toBe(2);
    });

    it("issuing a link removes that user's expired links and keeps live ones", async () => {
      await idp.createUser({ email: 'abe@example.test', password: PASSWORD, displayName: 'Abe' });
      await idp.createEmailActionLink('reset-password', 'abe@example.test', '/x');
      await idp.createEmailActionLink('verify-email', 'abe@example.test', '/login');
      t += EMAIL_ACTION_TTL_MS['reset-password']; // reset expired, verify still live
      await idp.createEmailActionLink('verify-email', 'abe@example.test', '/login');
      expect(countIn('authEmailActions')).toBe(2);
    });

    it('a link whose user doc vanished without cleanup is rejected as invalid', async () => {
      const uid = await idp.createUser({ email: 'cy@example.test', password: PASSWORD, displayName: 'Cy' });
      const link = await idp.createEmailActionLink('verify-email', 'cy@example.test', '/login');
      store.__store.delete(`authUsers/${uid}`);
      const token = new URL(link).searchParams.get('token') ?? '';
      await expect(idp.applyEmailAction('verify-email', token)).rejects.toBeInstanceOf(EmailActionInvalidError);
    });

    it('deleting a user removes their pending links', async () => {
      const uid = await idp.createUser({ email: 'bea@example.test', password: PASSWORD, displayName: 'Bea' });
      await idp.createEmailActionLink('verify-email', 'bea@example.test', '/login');
      await idp.deleteUser(uid);
      expect(countIn('authEmailActions')).toBe(0);
    });
  });
});

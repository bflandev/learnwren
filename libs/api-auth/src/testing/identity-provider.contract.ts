import { randomUUID } from 'node:crypto';

import { InvalidCredentialsException } from '../lib/errors/auth.exception';
import { EmailActionInvalidError, EmailInUseError } from '../lib/identity/identity.errors';
import type { IdentityProvider } from '../lib/identity/identity-provider.port';

export interface IdentityContractOptions {
  /** False only for an adapter that cannot observe revocation (the Firebase Auth emulator ignores checkRevoked). */
  readonly revocation: boolean;
  /** False for an adapter whose links are handled elsewhere (Firebase). */
  readonly emailActions: boolean;
}

const PASSWORD = 'Correct-Horse-9-battery';
const tokenOf = (link: string) => new URL(link).searchParams.get('token') ?? '';

/** Behaviour every IdentityProvider adapter must share (spec §5.1). */
export function describeIdentityProviderContract(
  label: string,
  makeProvider: () => IdentityProvider,
  options: IdentityContractOptions,
): void {
  describe(`IdentityProvider contract: ${label}`, () => {
    let idp: IdentityProvider;
    const email = () => `c${randomUUID().replace(/-/g, '').slice(0, 16)}@example.test`;
    const signIn = async (address: string, password = PASSWORD) =>
      idp.createSession(await idp.verifyPassword(address, password));

    beforeEach(() => {
      idp = makeProvider();
    });

    it('createUser returns a uid that getUser and getUserByEmail resolve, unverified', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'Ada' });
      expect(uid).not.toBe('');
      expect(await idp.getUser(uid)).toEqual({ uid, email: address, emailVerified: false });
      expect(await idp.getUserByEmail(address)).toEqual({ uid, email: address, emailVerified: false });
    });

    it('lookups resolve null for an unknown user', async () => {
      expect(await idp.getUser(`missing${randomUUID().slice(0, 8)}`)).toBeNull();
      expect(await idp.getUserByEmail(email())).toBeNull();
    });

    it('createUser rejects a taken email with EmailInUseError', async () => {
      const address = email();
      await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await expect(idp.createUser({ email: address, password: PASSWORD, displayName: 'B' })).rejects.toBeInstanceOf(
        EmailInUseError,
      );
    });

    it('verifyPassword returns a proof for the right password', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      expect((await idp.verifyPassword(address, PASSWORD)).uid).toBe(uid);
    });

    it('emails match case-insensitively', async () => {
      const address = email();
      const mixedCase = address.toUpperCase();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });

      expect(await idp.getUserByEmail(mixedCase)).toEqual({ uid, email: address, emailVerified: false });
      expect((await idp.verifyPassword(mixedCase, PASSWORD)).uid).toBe(uid);
      await expect(idp.createUser({ email: mixedCase, password: PASSWORD, displayName: 'B' })).rejects.toBeInstanceOf(
        EmailInUseError,
      );
    });

    it('createSession rejects a proof the adapter did not issue', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await expect(idp.createSession({ uid })).rejects.toThrow();
    });

    it('verifyPassword gives one generic rejection for a wrong password, an unknown email and a disabled account', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await expect(idp.verifyPassword(address, 'Wrong-Password-1!')).rejects.toBeInstanceOf(InvalidCredentialsException);
      await expect(idp.verifyPassword(email(), PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsException);
      await idp.updateUser(uid, { disabled: true });
      await expect(idp.verifyPassword(address, PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsException);
      await idp.updateUser(uid, { disabled: false });
      expect((await idp.verifyPassword(address, PASSWORD)).uid).toBe(uid);
    });

    it('a session carries uid, email, role and emailVerified', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await idp.setRole(uid, 'INSTRUCTOR');
      await idp.updateUser(uid, { emailVerified: true });
      const session = await signIn(address);
      expect(session.maxAgeSeconds).toBe(5 * 24 * 60 * 60);
      expect(await idp.verifySession(session.token)).toEqual({
        uid,
        email: address,
        role: 'INSTRUCTOR',
        emailVerified: true,
      });
    });

    it('verifySession resolves null for a token it never issued', async () => {
      expect(await idp.verifySession('not-a-session-token')).toBeNull();
    });

    it('updateUser changes the password and sets emailVerified', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await idp.updateUser(uid, { password: 'New-Password-77!', emailVerified: true });
      await expect(idp.verifyPassword(address, PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsException);
      expect((await idp.verifyPassword(address, 'New-Password-77!')).uid).toBe(uid);
      expect((await idp.getUser(uid))?.emailVerified).toBe(true);
    });

    it('deleteUser removes the user and is idempotent', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await idp.deleteUser(uid);
      expect(await idp.getUser(uid)).toBeNull();
      await expect(idp.verifyPassword(address, PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsException);
      await expect(idp.deleteUser(uid)).resolves.toBeUndefined();
    });

    it('createEmailActionLink returns an absolute URL for every kind', async () => {
      const address = email();
      await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      for (const kind of ['verify-email', 'reset-password'] as const) {
        expect(await idp.createEmailActionLink(kind, address, '/login')).toMatch(/^https?:\/\/\S+$/);
      }
      expect(
        await idp.createEmailActionLink('change-email', address, '/settings/profile/email-changed', email()),
      ).toMatch(/^https?:\/\/\S+$/);
    });

    it('a change-email link to a taken address rejects with EmailInUseError', async () => {
      const a = email();
      const b = email();
      await idp.createUser({ email: a, password: PASSWORD, displayName: 'A' });
      await idp.createUser({ email: b, password: PASSWORD, displayName: 'B' });
      await expect(idp.createEmailActionLink('change-email', a, '/x', b)).rejects.toBeInstanceOf(EmailInUseError);
    });

    it('endSession on an unknown token does not throw', async () => {
      await expect(idp.endSession('not-a-session-token')).resolves.toBeUndefined();
    });

    describe.skipIf(!options.revocation)('revocation', () => {
      it('endSession invalidates that session', async () => {
        const address = email();
        await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        const session = await signIn(address);
        await idp.endSession(session.token);
        expect(await idp.verifySession(session.token)).toBeNull();
      });

      it('revokeAllSessions invalidates every session of the user and no one else', async () => {
        const a = email();
        const b = email();
        const uid = await idp.createUser({ email: a, password: PASSWORD, displayName: 'A' });
        await idp.createUser({ email: b, password: PASSWORD, displayName: 'B' });
        const first = await signIn(a);
        const second = await signIn(a);
        const other = await signIn(b);
        await idp.revokeAllSessions(uid);
        expect(await idp.verifySession(first.token)).toBeNull();
        expect(await idp.verifySession(second.token)).toBeNull();
        expect(await idp.verifySession(other.token)).not.toBeNull();
      });

      it('deleting a user invalidates their sessions', async () => {
        const address = email();
        const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        const session = await signIn(address);
        await idp.deleteUser(uid);
        expect(await idp.verifySession(session.token)).toBeNull();
      });

      it('disabling a user rejects their existing session', async () => {
        const address = email();
        const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        const session = await signIn(address);
        await idp.updateUser(uid, { disabled: true });
        expect(await idp.verifySession(session.token)).toBeNull();
      });
    });

    describe.skipIf(!options.emailActions)('email actions', () => {
      it('verify-email marks the email verified and the token is single-use', async () => {
        const address = email();
        const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        const link = await idp.createEmailActionLink('verify-email', address, '/login');
        expect(new URL(link).searchParams.get('mode')).toBe('verify-email');
        await idp.applyEmailAction('verify-email', tokenOf(link));
        expect((await idp.getUser(uid))?.emailVerified).toBe(true);
        await expect(idp.applyEmailAction('verify-email', tokenOf(link))).rejects.toBeInstanceOf(EmailActionInvalidError);
      });

      it('reset-password sets the new password and revokes every session', async () => {
        const address = email();
        const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        const session = await signIn(address);
        const link = await idp.createEmailActionLink('reset-password', address, '/login?reset=ok');
        await idp.applyEmailAction('reset-password', tokenOf(link), 'Brand-New-Pass-42!');
        await expect(idp.verifyPassword(address, PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsException);
        expect((await idp.verifyPassword(address, 'Brand-New-Pass-42!')).uid).toBe(uid);
        expect(await idp.verifySession(session.token)).toBeNull();
      });

      it('change-email moves the account to the new address, verified', async () => {
        const oldAddress = email();
        const newAddress = email();
        const uid = await idp.createUser({ email: oldAddress, password: PASSWORD, displayName: 'A' });
        const link = await idp.createEmailActionLink('change-email', oldAddress, '/x', newAddress);
        await idp.applyEmailAction('change-email', tokenOf(link));
        expect(await idp.getUser(uid)).toEqual({ uid, email: newAddress, emailVerified: true });
        expect(await idp.getUserByEmail(oldAddress)).toBeNull();
        expect((await idp.verifyPassword(newAddress, PASSWORD)).uid).toBe(uid);
      });

      it('change-email rejects with EmailInUseError when the target was taken after the link was sent, changing nothing', async () => {
        const oldAddress = email();
        const target = email();
        const uid = await idp.createUser({ email: oldAddress, password: PASSWORD, displayName: 'A' });
        const link = await idp.createEmailActionLink('change-email', oldAddress, '/x', target);
        await idp.createUser({ email: target, password: PASSWORD, displayName: 'B' });
        await expect(idp.applyEmailAction('change-email', tokenOf(link))).rejects.toBeInstanceOf(EmailInUseError);
        expect((await idp.getUser(uid))?.email).toBe(oldAddress);
      });

      it('rejects an unknown token and a token used for the wrong kind', async () => {
        const address = email();
        await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        await expect(idp.applyEmailAction('verify-email', 'not-a-token')).rejects.toBeInstanceOf(EmailActionInvalidError);
        const link = await idp.createEmailActionLink('verify-email', address, '/login');
        await expect(idp.applyEmailAction('reset-password', tokenOf(link), 'Brand-New-Pass-42!')).rejects.toBeInstanceOf(
          EmailActionInvalidError,
        );
        await expect(idp.applyEmailAction('verify-email', tokenOf(link))).resolves.toBeUndefined();
      });

      it('a change-email invalidates pending password-reset links', async () => {
        const oldAddress = email();
        const newAddress = email();
        await idp.createUser({ email: oldAddress, password: PASSWORD, displayName: 'A' });
        const resetLink = await idp.createEmailActionLink('reset-password', oldAddress, '/login?reset=ok');
        const changeLink = await idp.createEmailActionLink('change-email', oldAddress, '/x', newAddress);
        await idp.applyEmailAction('change-email', tokenOf(changeLink));
        await expect(
          idp.applyEmailAction('reset-password', tokenOf(resetLink), 'Brand-New-Pass-42!'),
        ).rejects.toBeInstanceOf(EmailActionInvalidError);
      });
    });
  });
}

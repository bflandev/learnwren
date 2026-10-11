import { EmailActionInvalidError } from '../lib/identity/identity.errors';
import { describeIdentityProviderContract } from './identity-provider.contract';
import { createInMemoryIdentityProvider } from './in-memory-identity-provider';

describeIdentityProviderContract('in-memory', () => createInMemoryIdentityProvider(), { revocation: true, emailActions: true });

describe('createInMemoryIdentityProvider', () => {
  it('records minted links and exposes users for assertions', async () => {
    const idp = createInMemoryIdentityProvider();
    const uid = await idp.createUser({ email: 'a@example.test', password: 'p', displayName: 'A' });
    await idp.createEmailActionLink('reset-password', 'a@example.test', '/login?reset=ok');
    expect(idp.__links).toHaveLength(1);
    expect(idp.__links[0]).toContain('mode=reset-password');
    expect(idp.__links[0]).toContain('token=');
    expect(idp.__users.get(uid)?.email).toBe('a@example.test');
  });
});

describe('createInMemoryIdentityProvider guards', () => {
  it('rejects updateUser for an unknown uid', async () => {
    const idp = createInMemoryIdentityProvider();
    await expect(idp.updateUser('nobody', { disabled: true })).rejects.toThrow('in-memory identity: no user nobody');
  });

  it('rejects a change-email link without a new email', async () => {
    const idp = createInMemoryIdentityProvider();
    await idp.createUser({ email: 'a@example.test', password: 'p', displayName: 'A' });
    await expect(idp.createEmailActionLink('change-email', 'a@example.test', '/profile')).rejects.toThrow(
      'change-email requires newEmail',
    );
    expect(idp.__links).toHaveLength(0);
  });

  it('rejects a link for an unknown email', async () => {
    const idp = createInMemoryIdentityProvider();
    await expect(idp.createEmailActionLink('verify-email', 'ghost@example.test', '/login')).rejects.toThrow(
      'in-memory identity: no user for email',
    );
  });

  it('rejects a reset-password action with no new password and keeps the link usable', async () => {
    // Arrange
    const idp = createInMemoryIdentityProvider();
    const uid = await idp.createUser({ email: 'a@example.test', password: 'old', displayName: 'A' });
    const link = await idp.createEmailActionLink('reset-password', 'a@example.test', '/login');
    const token = new URL(link).searchParams.get('token') as string;

    // Act + Assert
    await expect(idp.applyEmailAction('reset-password', token)).rejects.toBeInstanceOf(EmailActionInvalidError);
    expect(idp.__users.get(uid)?.password).toBe('old');
    await idp.applyEmailAction('reset-password', token, 'new');
    expect(idp.__users.get(uid)?.password).toBe('new');
  });

  it('a changed email voids only that user\'s pending reset links', async () => {
    // Arrange
    const idp = createInMemoryIdentityProvider();
    const uid = await idp.createUser({ email: 'a@example.test', password: 'old', displayName: 'A' });
    const otherUid = await idp.createUser({ email: 'b@example.test', password: 'old', displayName: 'B' });
    const tokenOf = (link: string) => new URL(link).searchParams.get('token') as string;
    const ownVerify = await idp.createEmailActionLink('verify-email', 'a@example.test', '/login');
    const otherReset = await idp.createEmailActionLink('reset-password', 'b@example.test', '/login');
    const change = await idp.createEmailActionLink('change-email', 'a@example.test', '/profile', 'a2@example.test');

    // Act
    await idp.applyEmailAction('change-email', tokenOf(change));

    // Assert: a different kind for the same user and another user's reset both survive.
    await expect(idp.applyEmailAction('verify-email', tokenOf(ownVerify))).resolves.toBeUndefined();
    await idp.applyEmailAction('reset-password', tokenOf(otherReset), 'new');
    expect(idp.__users.get(otherUid)?.password).toBe('new');
    expect(idp.__users.get(uid)?.email).toBe('a2@example.test');
  });
});

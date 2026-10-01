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

import { describe, it, expect, vi } from 'vitest';

import { createInMemoryIdentityProvider } from '@learnwren/api-auth/testing';
import { createInMemoryDocumentStore } from '@learnwren/api-document-store';

import { promoteToAdmin, requireVerifiedUser } from './admin-promotion';

async function setup(verified: boolean) {
  const identity = createInMemoryIdentityProvider();
  const store = createInMemoryDocumentStore();
  const uid = await identity.createUser({ email: 'a@example.test', password: 'Aa1!aaaaaaaa', displayName: 'A' });
  if (verified) await identity.updateUser(uid, { emailVerified: true });
  await store.collection('users').doc(uid).set({ role: 'STUDENT' });
  return { identity, store, uid };
}

describe('promoteToAdmin', () => {
  it('sets the ADMIN role on the identity and the users document for a verified user', async () => {
    const { identity, store, uid } = await setup(true);

    const setRole = vi.spyOn(identity, 'setRole');

    await promoteToAdmin('a@example.test', identity, store);

    expect(setRole).toHaveBeenCalledWith(uid, 'ADMIN');
    expect((await store.collection('users').doc(uid).get()).data()?.['role']).toBe('ADMIN');
  });

  it('refuses an unverified account and changes nothing', async () => {
    const { identity, store, uid } = await setup(false);
    const setRole = vi.spyOn(identity, 'setRole');

    await expect(promoteToAdmin('a@example.test', identity, store)).rejects.toThrow(
      'Refusing to promote a@example.test: the account is not email-verified. Have the user verify their email first.',
    );
    expect(setRole).not.toHaveBeenCalled();
    expect((await store.collection('users').doc(uid).get()).data()?.['role']).toBe('STUDENT');
  });

  it('throws "No account for <email>" for an unknown email', async () => {
    const { identity, store } = await setup(true);

    await expect(promoteToAdmin('nobody@example.test', identity, store)).rejects.toThrow(
      'No account for nobody@example.test',
    );
  });
});

describe('requireVerifiedUser', () => {
  it('returns the verified user', async () => {
    const { identity, uid } = await setup(true);

    await expect(requireVerifiedUser('a@example.test', identity)).resolves.toMatchObject({ uid });
  });
});

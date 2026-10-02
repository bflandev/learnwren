import type { IdentityProvider, IdentityUser } from '@learnwren/api-auth';
import type { DocumentStore } from '@learnwren/api-document-store';

/** Structural slice of the identity port the operator tools need. */
export type OperatorIdentity = Pick<IdentityProvider, 'getUserByEmail' | 'setRole'>;
export type OperatorStore = Pick<DocumentStore, 'collection'>;

/** Look up an account by email; refuse a missing or unverified one. */
export async function requireVerifiedUser(email: string, identity: OperatorIdentity): Promise<IdentityUser> {
  const user = await identity.getUserByEmail(email);
  if (!user) throw new Error(`No account for ${email}`);
  if (!user.emailVerified) {
    throw new Error(
      `Refusing to promote ${email}: the account is not email-verified. ` +
        'Have the user verify their email first.',
    );
  }
  return user;
}

/** Operator-only ADMIN grant: identity role plus `users/{uid}.role`. */
export async function promoteToAdmin(
  email: string,
  identity: OperatorIdentity,
  store: OperatorStore,
): Promise<void> {
  const user = await requireVerifiedUser(email, identity);
  await identity.setRole(user.uid, 'ADMIN');
  await store.collection('users').doc(user.uid).update({ role: 'ADMIN' });
}

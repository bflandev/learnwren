import { Logger } from '@nestjs/common';
import type { DocRef, DocumentStore } from '@learnwren/api-document-store';
import type { UserRole } from '@learnwren/shared-data-models';

import { InvalidCredentialsException } from '../errors/auth.exception';
import { EmailActionInvalidError, EmailInUseError } from './identity.errors';
import {
  SESSION_MAX_AGE_SECONDS,
  type EmailActionKind,
  type IdentityProvider,
  type IdentityUser,
  type MintedSession,
  type PasswordProof,
  type SessionClaims,
} from './identity-provider.port';
import { newOpaqueToken, sha256Hex } from './opaque-token';
import { dummyPasswordHash, hashPassword, verifyPasswordHash } from './password-hash';
import { publicUrl } from './public-url';

export const LOCAL_COLLECTIONS = {
  users: 'authUsers',
  emails: 'authEmails',
  sessions: 'authSessions',
  actions: 'authEmailActions',
} as const;

const HOUR_MS = 60 * 60 * 1000;
export const EMAIL_ACTION_TTL_MS: Readonly<Record<EmailActionKind, number>> = {
  'verify-email': 24 * HOUR_MS,
  'reset-password': HOUR_MS,
  'change-email': HOUR_MS,
};

interface StoredUser {
  email: string;
  passwordHash: string;
  displayName: string;
  emailVerified: boolean;
  disabled: boolean;
  role?: UserRole;
  createdAt: string;
}
interface StoredSession {
  uid: string;
  expiresAt: number;
}
interface StoredAction {
  uid: string;
  kind: EmailActionKind;
  newEmail?: string;
  expiresAt: number;
}

const normalizeEmail = (email: string): string => email.toLowerCase();

/**
 * Self-hosted identity (spec §3.4): accounts, sessions and email-action tokens
 * stored through the DocumentStore port. Passwords are scrypt hashes; session
 * and action tokens are random bearer secrets stored only as SHA-256.
 *
 * ponytail: expired sessions and action tokens are rejected on read but never
 * swept; add a cleanup job if the collections grow large.
 */
export class LocalIdentityProvider implements IdentityProvider {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private static readonly logger = new Logger('LocalIdentityProvider');
  private readonly issuedProofs = new WeakSet<object>();

  constructor(
    private readonly store: DocumentStore,
    private readonly now: () => number = Date.now,
  ) {
    // Warm the memoised dummy hash at boot so the first unknown-email login
    // costs the same scrypt work as every later one, instead of paying for it
    // (plus losing the timing-safety it exists to provide) on that first call.
    // Caught here so a failure can never surface as an unhandled rejection.
    void dummyPasswordHash().catch((err: unknown) =>
      LocalIdentityProvider.logger.error(`failed to warm dummy password hash: ${String(err)}`),
    );
  }

  private userRef(uid: string): DocRef {
    return this.store.collection(LOCAL_COLLECTIONS.users).doc(uid);
  }
  private emailRef(email: string): DocRef {
    return this.store.collection(LOCAL_COLLECTIONS.emails).doc(sha256Hex(normalizeEmail(email)));
  }
  private sessionRef(token: string): DocRef {
    return this.store.collection(LOCAL_COLLECTIONS.sessions).doc(sha256Hex(token));
  }
  private actionRef(token: string): DocRef {
    return this.store.collection(LOCAL_COLLECTIONS.actions).doc(sha256Hex(token));
  }

  private async findByEmail(email: string): Promise<{ uid: string; user: StoredUser } | null> {
    const index = await this.emailRef(email).get();
    if (!index.exists) return null;
    const uid = (index.data() as { uid: string }).uid;
    const snap = await this.userRef(uid).get();
    return snap.exists ? { uid, user: snap.data() as StoredUser } : null;
  }

  async createUser(input: { email: string; password: string; displayName: string }): Promise<string> {
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    const uid = this.store.collection(LOCAL_COLLECTIONS.users).doc().id;
    const emailRef = this.emailRef(email);
    await this.store.runTransaction(async (txn) => {
      if ((await txn.get(emailRef)).exists) throw new EmailInUseError();
      txn.set(emailRef, { uid });
      const user: StoredUser = {
        email,
        passwordHash,
        displayName: input.displayName,
        emailVerified: false,
        disabled: false,
        createdAt: new Date(this.now()).toISOString(),
      };
      txn.set(this.userRef(uid), user);
    });
    return uid;
  }

  async getUser(uid: string): Promise<IdentityUser | null> {
    const snap = await this.userRef(uid).get();
    if (!snap.exists) return null;
    const user = snap.data() as StoredUser;
    return { uid, email: user.email, emailVerified: user.emailVerified };
  }

  async getUserByEmail(email: string): Promise<IdentityUser | null> {
    const found = await this.findByEmail(email);
    return found ? { uid: found.uid, email: found.user.email, emailVerified: found.user.emailVerified } : null;
  }

  async updateUser(uid: string, changes: { password?: string; disabled?: boolean; emailVerified?: boolean }): Promise<void> {
    const patch: Partial<StoredUser> = {
      ...(changes.password !== undefined ? { passwordHash: await hashPassword(changes.password) } : {}),
      ...(changes.disabled !== undefined ? { disabled: changes.disabled } : {}),
      ...(changes.emailVerified !== undefined ? { emailVerified: changes.emailVerified } : {}),
    };
    await this.userRef(uid).update(patch);
  }

  async deleteUser(uid: string): Promise<void> {
    const snap = await this.userRef(uid).get();
    if (snap.exists) {
      const user = snap.data() as StoredUser;
      const batch = this.store.batch();
      batch.delete(this.emailRef(user.email));
      batch.delete(this.userRef(uid));
      await batch.commit();
    }
    await this.revokeAllSessions(uid);
  }

  async setRole(uid: string, role: UserRole): Promise<void> {
    await this.userRef(uid).update({ role });
  }

  async verifyPassword(email: string, password: string): Promise<PasswordProof> {
    const found = await this.findByEmail(email);
    // Same scrypt cost whether or not the account exists: the response time must not reveal it.
    const matches = await verifyPasswordHash(password, found ? found.user.passwordHash : await dummyPasswordHash());
    if (!found || !matches || found.user.disabled) throw new InvalidCredentialsException();
    const proof: PasswordProof = { uid: found.uid };
    this.issuedProofs.add(proof);
    return proof;
  }

  async createSession(proof: PasswordProof): Promise<MintedSession> {
    if (!this.issuedProofs.has(proof)) throw new Error('Password proof was not issued by this identity provider');
    this.issuedProofs.delete(proof);
    const token = newOpaqueToken();
    const session: StoredSession = { uid: proof.uid, expiresAt: this.now() + SESSION_MAX_AGE_SECONDS * 1000 };
    await this.sessionRef(token).set(session);
    return { token, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
  }

  async verifySession(token: string): Promise<SessionClaims | null> {
    const snap = await this.sessionRef(token).get();
    if (!snap.exists) return null;
    const session = snap.data() as StoredSession;
    if (session.expiresAt <= this.now()) return null;
    const userSnap = await this.userRef(session.uid).get();
    if (!userSnap.exists) return null;
    const user = userSnap.data() as StoredUser;
    if (user.disabled) return null;
    return { uid: session.uid, email: user.email, role: user.role, emailVerified: user.emailVerified };
  }

  /** Ends this session only (Firebase ends all; callers needing that use revokeAllSessions). */
  async endSession(token: string): Promise<void> {
    await this.sessionRef(token).delete();
  }

  async revokeAllSessions(uid: string): Promise<void> {
    const snap = await this.store.collection(LOCAL_COLLECTIONS.sessions).where('uid', '==', uid).get();
    if (snap.empty) return;
    const batch = this.store.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
  }

  async createEmailActionLink(kind: EmailActionKind, email: string, _continuePath: string, newEmail?: string): Promise<string> {
    if (kind === 'change-email' && !newEmail) throw new Error('change-email requires newEmail');
    const found = await this.findByEmail(email);
    if (!found) throw new Error('No account for that email');
    if (kind === 'change-email' && (await this.emailRef(newEmail as string).get()).exists) throw new EmailInUseError();
    const token = newOpaqueToken();
    const action: StoredAction = {
      uid: found.uid,
      kind,
      ...(newEmail ? { newEmail: normalizeEmail(newEmail) } : {}),
      expiresAt: this.now() + EMAIL_ACTION_TTL_MS[kind],
    };
    await this.actionRef(token).set(action);
    return `${publicUrl('/auth/action')}?mode=${encodeURIComponent(kind)}&token=${encodeURIComponent(token)}`;
  }

  async applyEmailAction(kind: EmailActionKind, token: string, newPassword?: string): Promise<void> {
    const passwordHash = kind === 'reset-password' && newPassword ? await hashPassword(newPassword) : undefined;
    const actionRef = this.actionRef(token);
    const uid = await this.store.runTransaction(async (txn) => {
      const actionSnap = await txn.get(actionRef);
      if (!actionSnap.exists) throw new EmailActionInvalidError();
      const action = actionSnap.data() as StoredAction;
      if (action.kind !== kind || action.expiresAt <= this.now()) throw new EmailActionInvalidError();
      const userRef = this.userRef(action.uid);
      const userSnap = await txn.get(userRef);
      if (!userSnap.exists) throw new EmailActionInvalidError();
      const user = userSnap.data() as StoredUser;
      if (kind === 'change-email') {
        const target = action.newEmail as string;
        const targetRef = this.emailRef(target);
        if ((await txn.get(targetRef)).exists) throw new EmailInUseError();
        txn.delete(this.emailRef(user.email));
        txn.set(targetRef, { uid: action.uid });
        txn.update(userRef, { email: target, emailVerified: true });
      } else if (kind === 'reset-password') {
        if (!passwordHash) throw new EmailActionInvalidError();
        txn.update(userRef, { passwordHash });
      } else {
        txn.update(userRef, { emailVerified: true });
      }
      txn.delete(actionRef);
      return action.uid;
    });
    // ponytail: revoked after commit, not inside the SERIALIZABLE txn above — the revoke
    // is a query (collection().where(uid).get()) followed by a batch delete, which is
    // costly to run inside a serializable transaction (extra conflict surface, held
    // locks) for a path that only needs to be correct, not atomic, with the password
    // change. Consequence: if this post-commit call fails, the password has already
    // changed but old sessions survive until they expire naturally.
    if (kind === 'reset-password') await this.revokeAllSessions(uid);
  }
}

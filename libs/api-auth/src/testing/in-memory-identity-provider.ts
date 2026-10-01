import type { UserRole } from '@learnwren/shared-data-models';

import { InvalidCredentialsException } from '../lib/errors/auth.exception';
import { EmailActionInvalidError, EmailInUseError } from '../lib/identity/identity.errors';
import {
  SESSION_MAX_AGE_SECONDS,
  type EmailActionKind,
  type IdentityProvider,
  type IdentityUser,
  type PasswordProof,
} from '../lib/identity/identity-provider.port';

interface StoredUser {
  uid: string;
  email: string;
  password: string;
  emailVerified: boolean;
  disabled: boolean;
  role?: UserRole;
}

interface StoredAction {
  uid: string;
  kind: EmailActionKind;
  newEmail?: string;
}

export interface InMemoryIdentityProvider extends IdentityProvider {
  /** uid → user, for test assertions. Passwords are plain text: TEST ONLY. */
  readonly __users: Map<string, StoredUser>;
  /** Every link minted, in order, for test assertions. */
  readonly __links: string[];
}

/** A test double for IdentityProvider that passes the shared contract. Never used in production. */
export function createInMemoryIdentityProvider(): InMemoryIdentityProvider {
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, string>(); // token → uid
  const actions = new Map<string, StoredAction>(); // token → action
  const links: string[] = [];
  // Proofs this adapter minted via verifyPassword — createSession accepts only these (F2).
  const issuedProofs = new WeakSet<object>();
  let seq = 0;

  const normalizeEmail = (e: string) => e.toLowerCase();
  const view = (u: StoredUser): IdentityUser => ({ uid: u.uid, email: u.email, emailVerified: u.emailVerified });
  const byEmail = (email: string) => [...users.values()].find((u) => u.email === normalizeEmail(email));
  const mustGet = (uid: string): StoredUser => {
    const user = users.get(uid);
    if (!user) throw new Error(`in-memory identity: no user ${uid}`);
    return user;
  };
  const dropSessionsOf = (uid: string) => {
    for (const [token, owner] of sessions) if (owner === uid) sessions.delete(token);
  };

  return {
    __users: users,
    __links: links,
    async createUser({ email, password }) {
      if (byEmail(email)) throw new EmailInUseError();
      const uid = `user-${++seq}`;
      users.set(uid, { uid, email: normalizeEmail(email), password, emailVerified: false, disabled: false });
      return uid;
    },
    async getUser(uid) {
      const user = users.get(uid);
      return user ? view(user) : null;
    },
    async getUserByEmail(email) {
      const user = byEmail(email);
      return user ? view(user) : null;
    },
    async updateUser(uid, changes) {
      const user = mustGet(uid);
      users.set(uid, {
        ...user,
        ...(changes.password !== undefined ? { password: changes.password } : {}),
        ...(changes.disabled !== undefined ? { disabled: changes.disabled } : {}),
        ...(changes.emailVerified !== undefined ? { emailVerified: changes.emailVerified } : {}),
      });
    },
    async deleteUser(uid) {
      users.delete(uid);
      dropSessionsOf(uid);
    },
    async setRole(uid, role) {
      users.set(uid, { ...mustGet(uid), role });
    },
    async verifyPassword(email, password): Promise<PasswordProof> {
      const user = byEmail(email);
      if (!user || user.disabled || user.password !== password) throw new InvalidCredentialsException();
      const proof: PasswordProof = { uid: user.uid };
      issuedProofs.add(proof);
      return proof;
    },
    async createSession(proof) {
      if (!issuedProofs.has(proof)) throw new Error('in-memory identity: createSession given a proof it did not issue');
      const token = `session-${++seq}`;
      sessions.set(token, proof.uid);
      return { token, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
    },
    async verifySession(token) {
      const uid = sessions.get(token);
      const user = uid === undefined ? undefined : users.get(uid);
      if (!user || user.disabled) return null;
      return { uid: user.uid, email: user.email, role: user.role, emailVerified: user.emailVerified };
    },
    async endSession(token) {
      sessions.delete(token);
    },
    async revokeAllSessions(uid) {
      dropSessionsOf(uid);
    },
    async createEmailActionLink(kind: EmailActionKind, email, continuePath, newEmail) {
      if (kind === 'change-email' && !newEmail) throw new Error('change-email requires newEmail');
      if (kind === 'change-email' && byEmail(newEmail as string)) throw new EmailInUseError();
      const user = byEmail(email);
      if (!user) throw new Error('in-memory identity: no user for email');
      const token = `action-${++seq}`;
      actions.set(token, { uid: user.uid, kind, ...(newEmail ? { newEmail } : {}) });
      const link = `http://in-memory.test/auth/action?mode=${kind}&token=${token}`;
      links.push(link);
      return link;
    },
    async applyEmailAction(kind, token, newPassword) {
      const action = actions.get(token);
      if (!action || action.kind !== kind) throw new EmailActionInvalidError();
      if (kind === 'verify-email') {
        users.set(action.uid, { ...mustGet(action.uid), emailVerified: true });
        actions.delete(token);
        return;
      }
      if (kind === 'reset-password') {
        if (!newPassword) throw new EmailActionInvalidError();
        users.set(action.uid, { ...mustGet(action.uid), password: newPassword });
        dropSessionsOf(action.uid);
        actions.delete(token);
        return;
      }
      // kind is narrowed to 'change-email' here — the only remaining union member.
      const newEmail = action.newEmail as string;
      const existing = byEmail(newEmail);
      if (existing && existing.uid !== action.uid) throw new EmailInUseError();
      users.set(action.uid, { ...mustGet(action.uid), email: normalizeEmail(newEmail), emailVerified: true });
      actions.delete(token);
      // Mirrors LocalIdentityProvider: a changed email invalidates any pending reset-password link.
      for (const [pendingToken, pending] of actions) {
        if (pending.uid === action.uid && pending.kind === 'reset-password') actions.delete(pendingToken);
      }
    },
  };
}

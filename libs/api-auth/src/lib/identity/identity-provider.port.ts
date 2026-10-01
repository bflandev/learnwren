import type { UserRole } from '@learnwren/shared-data-models';

/**
 * The identity port (spec 2026-10-01 §3.4): every user-account and session
 * operation the api performs. Firebase Authentication is one adapter; the
 * self-hosted local adapter (D3b) is the other.
 *
 * Errors: createUser and the change-email link reject with EmailInUseError;
 * verifyPassword rejects with InvalidCredentialsException for an unknown
 * email, a wrong password or a disabled account (one generic answer, so the
 * response never reveals which). Lookups resolve null for an unknown user.
 */
export const IDENTITY_PROVIDER = Symbol.for('learnwren.api-auth.identity-provider');

/** Session lifetime: 5 days (unchanged from the Firebase session cookie). */
export const SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;

export interface IdentityUser {
  readonly uid: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

/** What a verified session tells the guards. `role` is the authoritative role for authorisation. */
export interface SessionClaims {
  readonly uid: string;
  readonly email: string;
  readonly role: UserRole | undefined;
  readonly emailVerified: boolean;
}

/**
 * Proof that a password check passed. Opaque beyond `uid`: each adapter
 * carries what it needs to mint a session (Firebase: the ID token).
 */
export interface PasswordProof {
  readonly uid: string;
}

export interface MintedSession {
  readonly token: string;
  readonly maxAgeSeconds: number;
}

export type EmailActionKind = 'verify-email' | 'reset-password' | 'change-email';

export interface IdentityProvider {
  createUser(input: { email: string; password: string; displayName: string }): Promise<string>;
  getUser(uid: string): Promise<IdentityUser | null>;
  getUserByEmail(email: string): Promise<IdentityUser | null>;
  updateUser(uid: string, changes: { password?: string; disabled?: boolean; emailVerified?: boolean }): Promise<void>;
  /** Idempotent: deleting a user that does not exist succeeds. */
  deleteUser(uid: string): Promise<void>;
  setRole(uid: string, role: UserRole): Promise<void>;
  verifyPassword(email: string, password: string): Promise<PasswordProof>;
  createSession(proof: PasswordProof): Promise<MintedSession>;
  /** null for an invalid, expired or revoked session token. */
  verifySession(token: string): Promise<SessionClaims | null>;
  /** Logout. Never throws for an already-invalid token. */
  endSession(token: string): Promise<void>;
  revokeAllSessions(uid: string): Promise<void>;
  /**
   * A single-use link that performs `kind` for `email`, then lands the
   * browser on `continuePath` of the public web app. `newEmail` is required
   * for 'change-email'.
   */
  createEmailActionLink(kind: EmailActionKind, email: string, continuePath: string, newEmail?: string): Promise<string>;
}

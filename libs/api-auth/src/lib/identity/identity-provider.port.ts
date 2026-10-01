import type { EmailActionMode, UserRole } from '@learnwren/shared-data-models';

/**
 * The identity port (spec 2026-10-01 §3.4): every user-account and session
 * operation the api performs. Firebase Authentication is one adapter; the
 * self-hosted local adapter (D3b) is the other.
 *
 * Errors: createUser and the change-email link reject with EmailInUseError;
 * verifyPassword rejects with InvalidCredentialsException for an unknown
 * email, a wrong password or a disabled account (one generic answer, so the
 * response never reveals which). Lookups resolve null for an unknown user.
 *
 * Emails are matched case-insensitively (createUser, getUserByEmail,
 * verifyPassword, and the EmailInUseError checks all normalise first).
 */
// Stryker disable next-line StringLiteral: equivalent — the Symbol.for() registry
// key is never read back; IDENTITY_PROVIDER is used only by reference (DI token
// identity), so any key string yields an indistinguishable symbol.
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
 * carries what it needs to mint a session (Firebase: the ID token). Only
 * valid when it came from that same provider's `verifyPassword` — a
 * hand-built proof must be rejected by `createSession`.
 */
export interface PasswordProof {
  readonly uid: string;
}

export interface MintedSession {
  readonly token: string;
  readonly maxAgeSeconds: number;
}

export type EmailActionKind = EmailActionMode;

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
  /**
   * Logout. Never throws for an already-invalid token. Firebase revokes
   * every session of the user; other adapters may end only this one.
   * Callers that need every device signed out call revokeAllSessions.
   */
  endSession(token: string): Promise<void>;
  revokeAllSessions(uid: string): Promise<void>;
  /**
   * A single-use link that performs `kind` for `email`, then lands the
   * browser on `continuePath` of the public web app. `newEmail` is required
   * for 'change-email'.
   */
  createEmailActionLink(kind: EmailActionKind, email: string, continuePath: string, newEmail?: string): Promise<string>;
  /**
   * Consume a single-use token from an emailed link (D3b). 'verify-email'
   * marks the email verified; 'reset-password' sets `newPassword` and revokes
   * every session; 'change-email' moves the account to the new address and
   * marks it verified. Rejects with EmailActionInvalidError for an unknown,
   * expired, used or wrong-kind token, and EmailInUseError when the
   * change-email target was taken after the link was sent. Adapters whose
   * links are handled elsewhere (Firebase's hosted action page) always reject
   * with EmailActionInvalidError.
   */
  applyEmailAction(kind: EmailActionKind, token: string, newPassword?: string): Promise<void>;
}

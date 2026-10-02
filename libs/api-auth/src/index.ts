export { AuthModule } from './lib/auth.module';
export { FirebaseSessionGuard } from './lib/firebase-session.guard';
export { InstructorRoleGuard } from './lib/instructor-role.guard';
export { AdminRoleGuard } from './lib/admin-role.guard';
export { AuthException, InsufficientRoleException } from './lib/errors/auth.exception';
export type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './lib/types/authenticated-request';
export { FirebaseAuthRestClient } from './lib/firebase-auth-rest-client';
export { SessionCookieHelper } from './lib/session-cookie.helper';
export {
  EMAIL_TRANSPORT,
  type EmailTransport,
  type EmailChangeVerificationEmailInput,
  type NewModuleEmailInput,
} from './lib/email-transport/email-transport';
export { PasswordPolicyService } from './lib/password-policy.service';
export { PasswordVerificationService } from './lib/password-verification.service';
export type { PolicyRequirement, PasswordPolicyResult } from './lib/password-policy.service';
export {
  IDENTITY_PROVIDER,
  SESSION_MAX_AGE_SECONDS,
  type IdentityProvider,
  type IdentityUser,
  type SessionClaims,
  type PasswordProof,
  type MintedSession,
  type EmailActionKind,
} from './lib/identity/identity-provider.port';
export { EmailInUseError, EmailActionInvalidError } from './lib/identity/identity.errors';
export { publicUrl } from './lib/identity/public-url';
export { LocalIdentityProvider } from './lib/identity/local-identity-provider';

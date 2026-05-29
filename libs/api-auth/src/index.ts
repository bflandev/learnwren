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
} from './lib/email-transport/email-transport';
export { PasswordPolicyService } from './lib/password-policy.service';
export type { PolicyRequirement, PasswordPolicyResult } from './lib/password-policy.service';

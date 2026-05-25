export { AuthModule } from './lib/auth.module';
export { FirebaseSessionGuard } from './lib/firebase-session.guard';
export { InstructorRoleGuard } from './lib/instructor-role.guard';
export { AuthException, InsufficientRoleException } from './lib/errors/auth.exception';
export type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './lib/types/authenticated-request';

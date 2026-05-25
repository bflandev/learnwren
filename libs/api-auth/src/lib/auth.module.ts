import { Module } from '@nestjs/common';

import { AccountRecoveryService } from './account-recovery.service';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { AuthController } from './auth.controller';
import { AuthExceptionFilter } from './auth.exception-filter';
import { AuthService } from './auth.service';
import { ConsoleEmailTransport } from './email-transport/console-email-transport';
import { EMAIL_TRANSPORT } from './email-transport/email-transport';
import { resolveEmailTransport } from './email-transport/email-transport.factory';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import { FirebaseSessionGuard } from './firebase-session.guard';
import { InstructorRoleGuard } from './instructor-role.guard';
import { PasswordPolicyService } from './password-policy.service';
import { SessionCookieHelper } from './session-cookie.helper';
import { SessionCookieService } from './session-cookie.service';

@Module({
  controllers: [AuthController],
  providers: [
    AccountRecoveryService,
    AuthService,
    AuthAttemptsRepository,
    AuthExceptionFilter,
    ConsoleEmailTransport, // fallback class registration; factory chooses concrete impl
    FirebaseAuthRestClient,
    FirebaseSessionGuard,
    InstructorRoleGuard,
    PasswordPolicyService,
    SessionCookieHelper,
    SessionCookieService,
    {
      provide: EMAIL_TRANSPORT,
      useFactory: () => resolveEmailTransport(),
    },
  ],
  exports: [FirebaseSessionGuard, InstructorRoleGuard],
})
export class AuthModule {}

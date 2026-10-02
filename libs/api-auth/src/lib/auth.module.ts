import { Module } from '@nestjs/common';
import { DOCUMENT_STORE, type DocumentStore } from '@learnwren/api-document-store';

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
import { FirebaseIdentityProvider } from './identity/firebase-identity-provider';
import { IDENTITY_PROVIDER } from './identity/identity-provider.port';
import { makeIdentityProvider, readIdentityConfigFromEnv } from './identity/identity.config';
import { AdminRoleGuard } from './admin-role.guard';
import { InstructorRoleGuard } from './instructor-role.guard';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordVerificationService } from './password-verification.service';
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
    // ponytail: FirebaseAuthRestClient and FirebaseIdentityProvider are still
    // built in local mode too — harmless, since neither touches the network
    // until called, and the emulator-mode FIREBASE_WEB_API_KEY defaults to
    // 'fake-api-key'. Combining local with LEARNWREN_FIREBASE_TARGET=production
    // is unsupported (it would demand a real web API key); make these
    // conditional only if that combination is ever needed.
    FirebaseAuthRestClient,
    FirebaseIdentityProvider,
    AdminRoleGuard,
    FirebaseSessionGuard,
    InstructorRoleGuard,
    PasswordPolicyService,
    PasswordVerificationService,
    SessionCookieHelper,
    SessionCookieService,
    {
      provide: EMAIL_TRANSPORT,
      useFactory: () => resolveEmailTransport(),
    },
    {
      provide: IDENTITY_PROVIDER,
      inject: [FirebaseIdentityProvider, DOCUMENT_STORE],
      useFactory: (firebase: FirebaseIdentityProvider, store: DocumentStore) =>
        makeIdentityProvider(readIdentityConfigFromEnv(process.env), firebase, store),
    },
  ],
  exports: [
    AdminRoleGuard,
    FirebaseSessionGuard,
    InstructorRoleGuard,
    EMAIL_TRANSPORT,
    FirebaseAuthRestClient,
    SessionCookieHelper,
    PasswordPolicyService,
    PasswordVerificationService,
    IDENTITY_PROVIDER,
  ],
})
export class AuthModule {}

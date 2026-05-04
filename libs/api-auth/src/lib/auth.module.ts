import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseSessionGuard } from './firebase-session.guard';
import { PasswordPolicyService } from './password-policy.service';
import { SessionCookieHelper } from './session-cookie.helper';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordPolicyService,
    SessionCookieHelper,
    FirebaseSessionGuard,
  ],
  exports: [FirebaseSessionGuard],
})
export class AuthModule {}

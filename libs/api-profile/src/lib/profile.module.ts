import { Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { PICTURE_CONFIG, readPictureConfigFromEnv, type PictureConfig } from './picture/picture.config';
import {
  PICTURE_STORAGE,
  FirebasePictureStorageAdapter,
} from './picture/picture-storage.adapter';
import { FakePictureStorageAdapter } from './picture/fake-picture-storage.adapter';
import { PictureExceptionFilter } from './picture/picture.exception-filter';
import { ProfilePictureController } from './picture/profile-picture.controller';
import { ProfilePictureService } from './picture/profile-picture.service';
import { EmailChangeController } from './email/email-change.controller';
import { EmailChangeExceptionFilter } from './email/email.exception-filter';
import { EmailChangeService } from './email/email-change.service';
import { PasswordChangeController } from './password/password-change.controller';
import { PasswordChangeExceptionFilter } from './password/password.exception-filter';
import { PasswordChangeService } from './password/password-change.service';
import { AdminInstructorApplicationController } from './instructor-application/admin-instructor-application.controller';
import { AdminInstructorApplicationExceptionFilter } from './instructor-application/admin-instructor-application.exception-filter';
import { AdminInstructorApplicationService } from './instructor-application/admin-instructor-application.service';
import { InstructorApplicationController } from './instructor-application/instructor-application.controller';
import { InstructorApplicationExceptionFilter } from './instructor-application/instructor-application.exception-filter';
import { InstructorApplicationService } from './instructor-application/instructor-application.service';
import { ProfileController } from './profile.controller';
import { ProfileExceptionFilter } from './profile.exception-filter';
import { ProfileService } from './profile.service';

@Module({
  imports: [AuthModule], // pulls in FirebaseSessionGuard
  controllers: [ProfileController, ProfilePictureController, EmailChangeController, PasswordChangeController, InstructorApplicationController, AdminInstructorApplicationController],
  providers: [
    ProfileService,
    ProfileExceptionFilter,
    ProfilePictureService,
    PictureExceptionFilter,
    EmailChangeService,
    EmailChangeExceptionFilter,
    PasswordChangeService,
    PasswordChangeExceptionFilter,
    AdminInstructorApplicationService,
    AdminInstructorApplicationExceptionFilter,
    InstructorApplicationService,
    InstructorApplicationExceptionFilter,
    FirebasePictureStorageAdapter,
    { provide: PICTURE_CONFIG, useFactory: () => readPictureConfigFromEnv(process.env) },
    {
      provide: PICTURE_STORAGE,
      inject: [PICTURE_CONFIG, FirebasePictureStorageAdapter],
      useFactory: (cfg: PictureConfig, firebase: FirebasePictureStorageAdapter) =>
        cfg.impl === 'firebase' ? firebase : new FakePictureStorageAdapter(),
    },
  ],
})
export class ProfileModule {}

import { Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { ProfileController } from './profile.controller';
import { ProfileExceptionFilter } from './profile.exception-filter';
import { ProfileService } from './profile.service';

@Module({
  imports: [AuthModule],            // pulls in FirebaseSessionGuard
  controllers: [ProfileController],
  providers: [ProfileService, ProfileExceptionFilter],
})
export class ProfileModule {}

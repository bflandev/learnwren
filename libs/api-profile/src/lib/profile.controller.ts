import { Body, Controller, Get, Patch, Req, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { MeResponse, ProfileView } from '@learnwren/shared-data-models';

import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileExceptionFilter } from './profile.exception-filter';
import { ProfileService } from './profile.service';

@Controller('profile')
@UseFilters(ProfileExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class ProfileController {
  constructor(private readonly svc: ProfileService) {}

  @Get()
  async get(@Req() req: AuthenticatedRequest): Promise<ProfileView> {
    const user = req.user!;
    return this.svc.getProfile(user.uid, { email: user.email, emailVerified: user.emailVerified });
  }

  @Patch()
  async update(
    @Body() dto: UpdateProfileDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MeResponse> {
    const user = req.user!;
    return this.svc.updateProfile(
      user.uid,
      { displayName: dto.displayName, biography: dto.biography },
      { email: user.email, emailVerified: user.emailVerified },
    );
  }
}

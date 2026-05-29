import { Body, Controller, HttpCode, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { FirebaseSessionGuard, SessionCookieHelper } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';

import { ChangePasswordDto } from './dto/change-password.dto';
import { PasswordChangeExceptionFilter } from './password.exception-filter';
import { PasswordChangeService } from './password-change.service';

@Controller('profile/password')
@UseFilters(PasswordChangeExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class PasswordChangeController {
  constructor(
    private readonly svc: PasswordChangeService,
    private readonly cookieHelper: SessionCookieHelper,
  ) {}

  @Post()
  @HttpCode(204)
  async change(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const user = req.user!;
    await this.svc.changePassword(user.uid, user.email, {
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });
    res.setHeader('Set-Cookie', this.cookieHelper.toClearingCookie());
  }
}

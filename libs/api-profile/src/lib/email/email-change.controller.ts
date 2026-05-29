import { Body, Controller, HttpCode, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { FirebaseSessionGuard, SessionCookieHelper } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { ConfirmEmailChangeResponse } from '@learnwren/shared-data-models';

import { ChangeEmailDto } from './dto/change-email.dto';
import { EmailChangeExceptionFilter } from './email.exception-filter';
import { EmailChangeService } from './email-change.service';

@Controller('profile/email')
@UseFilters(EmailChangeExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class EmailChangeController {
  constructor(
    private readonly svc: EmailChangeService,
    private readonly cookieHelper: SessionCookieHelper,
  ) {}

  @Post()
  @HttpCode(202)
  async request(@Body() dto: ChangeEmailDto, @Req() req: AuthenticatedRequest): Promise<void> {
    const user = req.user!;
    await this.svc.requestChange(user.uid, user.email, {
      newEmail: dto.newEmail,
      currentPassword: dto.currentPassword,
    });
  }

  @Post('confirm')
  @HttpCode(200)
  async confirm(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConfirmEmailChangeResponse> {
    const user = req.user!;
    const result = await this.svc.confirmChange(user.uid, user.email);
    if (result.changed) {
      res.setHeader('Set-Cookie', this.cookieHelper.toClearingCookie());
    }
    return result;
  }
}

import { Body, Controller, Delete, HttpCode, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { FirebaseSessionGuard, SessionCookieHelper } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';

import { AccountDeletionExceptionFilter } from './account-deletion.exception-filter';
import { AccountDeletionService } from './account-deletion.service';
import { DeleteAccountDto } from './dto/delete-account.dto';

@Controller('profile/account')
@UseFilters(AccountDeletionExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class AccountDeletionController {
  constructor(
    private readonly svc: AccountDeletionService,
    private readonly cookieHelper: SessionCookieHelper,
  ) {}

  @Delete()
  @HttpCode(204)
  async delete(
    @Body() dto: DeleteAccountDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const user = req.user!;
    await this.svc.deleteOwnAccount(user.uid, user.email, dto.currentPassword);
    res.setHeader('Set-Cookie', this.cookieHelper.toClearingCookie());
  }
}

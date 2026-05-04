import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthExceptionFilter } from './auth.exception-filter';
import { AuthService, type MeResponse } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { SessionDto } from './dto/session.dto';
import { FirebaseSessionGuard } from './firebase-session.guard';
import { SessionCookieHelper } from './session-cookie.helper';
import type { AuthenticatedRequest } from './types/authenticated-request';

interface RegisterResponseBody {
  uid: string;
  email: string;
  emailVerificationSent: boolean;
}

interface SessionResponseBody {
  uid: string;
  role: string;
}

@Controller('auth')
@UseFilters(AuthExceptionFilter)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookieHelper: SessionCookieHelper,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseBody> {
    const result = await this.authService.register({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
    });
    return {
      uid: result.uid,
      email: result.email,
      emailVerificationSent: result.emailVerificationSent,
    };
  }

  @Post('session')
  async session(
    @Body() dto: SessionDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseBody> {
    const minted = await this.authService.createSessionCookie(dto.idToken);
    res.setHeader(
      'Set-Cookie',
      this.sessionCookieHelper.toSetCookie(minted.cookie, {
        maxAgeSeconds: minted.maxAgeSeconds,
      }),
    );
    return { uid: minted.uid, role: minted.role };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookie = req.cookies?.[SessionCookieHelper.COOKIE_NAME];
    await this.authService.logoutSideEffects(cookie);
    res.setHeader('Set-Cookie', this.sessionCookieHelper.toClearingCookie());
  }

  @Get('me')
  @UseGuards(FirebaseSessionGuard)
  async me(@Req() req: AuthenticatedRequest): Promise<MeResponse> {
    const user = req.user!;
    return this.authService.getMe(user.uid, {
      email: user.email,
      emailVerified: user.emailVerified,
    });
  }
}

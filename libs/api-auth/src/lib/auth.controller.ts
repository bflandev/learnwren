import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthExceptionFilter } from './auth.exception-filter';
import { AuthService, type MeResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { UnlockDto } from './dto/unlock.dto';
import { ConsoleEmailTransport } from './email-transport/console-email-transport';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport/email-transport';
import { FirebaseSessionGuard } from './firebase-session.guard';
import { SessionCookieHelper } from './session-cookie.helper';
import type { AuthenticatedRequest } from './types/authenticated-request';

interface RegisterResponseBody {
  uid: string;
  email: string;
  role: string;
  emailVerified: boolean;
}

interface LoginResponseBody {
  uid: string;
  role: string;
  displayName: string;
  emailVerified: true;
}

@Controller('auth')
@UseFilters(AuthExceptionFilter)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookieHelper: SessionCookieHelper,
    @Inject(EMAIL_TRANSPORT) private readonly emailTransport: EmailTransport,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterResponseBody> {
    const result = await this.authService.register({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
    });
    res.setHeader(
      'Set-Cookie',
      this.sessionCookieHelper.toSetCookie(result.cookie, {
        maxAgeSeconds: result.maxAgeSeconds,
      }),
    );
    return {
      uid: result.uid,
      email: result.email,
      role: result.role,
      emailVerified: false, // freshly-registered accounts are unverified by definition
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseBody> {
    const result = await this.authService.login({ email: dto.email, password: dto.password });
    res.setHeader(
      'Set-Cookie',
      this.sessionCookieHelper.toSetCookie(result.cookie, {
        maxAgeSeconds: result.maxAgeSeconds,
      }),
    );
    return {
      uid: result.uid,
      role: result.role,
      displayName: result.displayName,
      emailVerified: result.emailVerified,
    };
  }

  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<void> {
    await this.authService.resendVerification(dto.email);
  }

  @Post('request-password-reset')
  @HttpCode(202)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void> {
    await this.authService.requestPasswordReset(dto.email);
  }

  @Post('unlock')
  @HttpCode(204)
  async unlock(@Body() dto: UnlockDto): Promise<void> {
    await this.authService.unlock(dto.token);
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

  // Test-mode-only: surface the last in-process email URL (unlock or
  // verification) so the api-e2e suite can drive the redemption flows now
  // that unlock tokens are hashed before being persisted. Gated by
  // LEARNWREN_TEST_OUTBOX_ENABLED so it cannot be reached in production.
  @Get('_test/last-email')
  async lastTestEmail(
    @Query('to') to: string,
    @Query('kind') kind: 'unlock' | 'verification' | 'password-reset',
  ): Promise<{ url: string; sentAt: string }> {
    if (process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] !== '1') {
      throw new NotFoundException();
    }
    if (!(this.emailTransport instanceof ConsoleEmailTransport)) {
      throw new NotFoundException();
    }
    const entry = this.emailTransport.lastSentTo(to, kind);
    if (!entry) throw new NotFoundException();
    return { url: entry.url, sentAt: entry.sentAt.toISOString() };
  }
}

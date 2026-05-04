import { Injectable } from '@nestjs/common';

export interface SessionCookieOptions {
  maxAgeSeconds: number;
}

@Injectable()
export class SessionCookieHelper {
  static readonly COOKIE_NAME = '__session';

  toSetCookie(value: string, options: SessionCookieOptions): string {
    return `${SessionCookieHelper.COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${options.maxAgeSeconds}`;
  }

  toClearingCookie(): string {
    return `${SessionCookieHelper.COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
  }
}

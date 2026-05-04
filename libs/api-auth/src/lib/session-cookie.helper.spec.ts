import { describe, expect, it } from 'vitest';

import { SessionCookieHelper } from './session-cookie.helper';

const helper = new SessionCookieHelper();

describe('SessionCookieHelper', () => {
  it('builds a Set-Cookie value with all five required flags', () => {
    const setCookie = helper.toSetCookie('abc.def.ghi', { maxAgeSeconds: 432000 });
    expect(setCookie).toBe(
      '__session=abc.def.ghi; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=432000',
    );
  });

  it('builds a clearing Set-Cookie value with empty value and Max-Age=0', () => {
    const setCookie = helper.toClearingCookie();
    expect(setCookie).toBe(
      '__session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    );
  });

  it('exposes the cookie name as a static so the guard can read it consistently', () => {
    expect(SessionCookieHelper.COOKIE_NAME).toBe('__session');
  });
});

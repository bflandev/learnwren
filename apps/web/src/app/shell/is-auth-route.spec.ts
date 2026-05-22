import { describe, expect, it } from 'vitest';

import { isAuthRoute } from './is-auth-route';

describe('isAuthRoute', () => {
  it('is true for the auth pages', () => {
    expect(isAuthRoute('/login')).toBe(true);
    expect(isAuthRoute('/register')).toBe(true);
    expect(isAuthRoute('/register/confirm')).toBe(true);
    expect(isAuthRoute('/forgot-password')).toBe(true);
    expect(isAuthRoute('/auth/unlock')).toBe(true);
  });

  it('ignores query strings', () => {
    expect(isAuthRoute('/login?redirect=%2Fdashboard')).toBe(true);
  });

  it('is false for discovery and app routes', () => {
    expect(isAuthRoute('/catalog')).toBe(false);
    expect(isAuthRoute('/catalog/c-1')).toBe(false);
    expect(isAuthRoute('/search?q=rust')).toBe(false);
    expect(isAuthRoute('/dashboard')).toBe(false);
    expect(isAuthRoute('/courses')).toBe(false);
    expect(isAuthRoute('/')).toBe(false);
  });

  it('does not false-match on a prefix collision', () => {
    expect(isAuthRoute('/registers-of-deeds')).toBe(false);
    expect(isAuthRoute('/loginhelp')).toBe(false);
    expect(isAuthRoute('/registered')).toBe(false);
  });
});

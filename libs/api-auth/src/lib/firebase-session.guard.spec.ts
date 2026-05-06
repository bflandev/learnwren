import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FirebaseSessionGuard } from './firebase-session.guard';

function buildContext(cookies: Record<string, string> | undefined): ExecutionContext {
  const request = { cookies, user: undefined };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function buildAuth(verify: ReturnType<typeof vi.fn>) {
  return { verifySessionCookie: verify };
}

describe('FirebaseSessionGuard', () => {
  it('throws UNAUTHENTICATED when no cookie is present', async () => {
    const verify = vi.fn();
    const guard = new FirebaseSessionGuard(buildAuth(verify) as never);
    await expect(guard.canActivate(buildContext({}))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('throws UNAUTHENTICATED when verifySessionCookie rejects', async () => {
    const verify = vi.fn(async () => {
      throw new Error('expired');
    });
    const guard = new FirebaseSessionGuard(buildAuth(verify) as never);
    await expect(
      guard.canActivate(buildContext({ __session: 'bad' })),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('attaches request.user on a valid cookie and returns true', async () => {
    const verify = vi.fn(async () => ({
      uid: 'uid-1',
      email: 'a@b.c',
      role: 'STUDENT',
      email_verified: true,
    }));
    const guard = new FirebaseSessionGuard(buildAuth(verify) as never);
    const ctx = buildContext({ __session: 'good.cookie' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('good.cookie', true);

    const req = ctx.switchToHttp().getRequest<{ user?: unknown }>();
    expect(req.user).toEqual({
      uid: 'uid-1',
      email: 'a@b.c',
      role: 'STUDENT',
      emailVerified: true,
    });
  });

  it('throws UNAUTHENTICATED when req.cookies is undefined entirely (not just empty)', async () => {
    // The guard uses `req.cookies?.[NAME]` — if cookie-parser middleware didn't
    // run, req.cookies is undefined, not {}. The optional-chain must handle it.
    const verify = vi.fn();
    const guard = new FirebaseSessionGuard(buildAuth(verify) as never);
    await expect(guard.canActivate(buildContext(undefined))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('defaults user.email to the empty string when decoded.email is missing', async () => {
    // Service-account-issued cookies sometimes lack `email`. The guard must
    // populate req.user.email with '' rather than undefined so downstream
    // controllers can rely on the field being a string.
    const verify = vi.fn(async () => ({
      uid: 'uid-1',
      // no email field
      role: 'STUDENT',
      email_verified: false,
    }));
    const guard = new FirebaseSessionGuard(buildAuth(verify) as never);
    const ctx = buildContext({ __session: 'no.email.cookie' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest<{ user?: { email: string } }>();
    expect(req.user?.email).toBe('');
  });
});

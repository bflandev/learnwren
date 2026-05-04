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
});

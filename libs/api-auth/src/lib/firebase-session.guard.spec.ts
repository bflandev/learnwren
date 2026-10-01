import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { IdentityProvider } from './identity/identity-provider.port';
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

function buildIdentity(verifySession: ReturnType<typeof vi.fn>): IdentityProvider {
  return { verifySession } as unknown as IdentityProvider;
}

describe('FirebaseSessionGuard', () => {
  it('throws UNAUTHENTICATED when no cookie is present', async () => {
    const verifySession = vi.fn();
    const guard = new FirebaseSessionGuard(buildIdentity(verifySession));
    await expect(guard.canActivate(buildContext({}))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('throws UNAUTHENTICATED when identity.verifySession resolves null', async () => {
    const verifySession = vi.fn(async () => null);
    const guard = new FirebaseSessionGuard(buildIdentity(verifySession));
    await expect(
      guard.canActivate(buildContext({ __session: 'bad' })),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('attaches request.user on a valid cookie and returns true', async () => {
    const verifySession = vi.fn(async () => ({
      uid: 'uid-1',
      email: 'a@b.c',
      role: 'STUDENT',
      emailVerified: true,
    }));
    const guard = new FirebaseSessionGuard(buildIdentity(verifySession));
    const ctx = buildContext({ __session: 'good.cookie' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(verifySession).toHaveBeenCalledWith('good.cookie');

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
    const verifySession = vi.fn();
    const guard = new FirebaseSessionGuard(buildIdentity(verifySession));
    await expect(guard.canActivate(buildContext(undefined))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('passes through email as the empty string when the port claims it so (no undefined downstream)', async () => {
    // SessionClaims.email is a required string on the port; the adapter
    // already normalizes a missing Firebase claim to ''. The guard must not
    // re-introduce undefined by mangling the field.
    const verifySession = vi.fn(async () => ({
      uid: 'uid-1',
      email: '',
      role: 'STUDENT',
      emailVerified: false,
    }));
    const guard = new FirebaseSessionGuard(buildIdentity(verifySession));
    const ctx = buildContext({ __session: 'no.email.cookie' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest<{ user?: { email: string } }>();
    expect(req.user?.email).toBe('');
  });
});

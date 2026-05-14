import { describe, expect, it, vi } from 'vitest';

import {
  PubSubInvalidTokenException,
  PubSubWrongAudienceException,
  PubSubWrongInvokerException,
} from '../errors/video.exception';
import { PubSubPushGuard } from './pubsub-push.guard';

function ctx(headers: Record<string, string>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as never;
}

function makeGuard(opts: {
  audience: string;
  invokerSaEmail: string;
  verifier: (token: string) => Promise<{
    getPayload: () => { iss?: string; aud?: string; email?: string; exp?: number };
  }>;
}) {
  return new PubSubPushGuard(
    { webhookAudience: opts.audience, invokerSaEmail: opts.invokerSaEmail } as never,
    { verifyIdToken: opts.verifier } as never,
  );
}

describe('PubSubPushGuard', () => {
  const cfg = { audience: 'https://aud', invokerSaEmail: 'sa@p.iam.gserviceaccount.com' };

  it('passes when issuer + audience + email match and not expired', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: cfg.audience,
          email: cfg.invokerSaEmail,
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      })),
    });
    await expect(g.canActivate(ctx({ authorization: 'Bearer xyz' }))).resolves.toBe(true);
  });

  it('rejects when Authorization header is missing', async () => {
    const g = makeGuard({ ...cfg, verifier: vi.fn() });
    await expect(g.canActivate(ctx({}))).rejects.toBeInstanceOf(PubSubInvalidTokenException);
  });

  it('rejects when the verifier throws', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => {
        throw new Error('bad sig');
      }),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toBeInstanceOf(PubSubInvalidTokenException);
  });

  it('rejects when issuer is wrong', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://evil',
          aud: cfg.audience,
          email: cfg.invokerSaEmail,
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      })),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toBeInstanceOf(PubSubInvalidTokenException);
  });

  it('rejects when audience does not match', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: 'https://other',
          email: cfg.invokerSaEmail,
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      })),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toBeInstanceOf(PubSubWrongAudienceException);
  });

  it('rejects when invoker email does not match', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: cfg.audience,
          email: 'someone-else@p.iam.gserviceaccount.com',
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      })),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toBeInstanceOf(PubSubWrongInvokerException);
  });

  it('rejects expired tokens', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: cfg.audience,
          email: cfg.invokerSaEmail,
          exp: Math.floor(Date.now() / 1000) - 10,
        }),
      })),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toBeInstanceOf(PubSubInvalidTokenException);
  });
});

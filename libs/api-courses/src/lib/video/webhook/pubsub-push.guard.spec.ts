import { describe, expect, it, vi } from 'vitest';

import {
  PubSubInvalidTokenException,
  PubSubWrongAudienceException,
  PubSubWrongInvokerException,
} from '../errors/video.exception';
import { PubSubPushGuard } from './pubsub-push.guard';

function ctx(headers: Record<string, string | string[] | undefined>) {
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
    const verifier = vi.fn(async () => ({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        aud: cfg.audience,
        email: cfg.invokerSaEmail,
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    }));
    const g = makeGuard({ ...cfg, verifier });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer  the-token ' })),
    ).resolves.toBe(true);
    // The "Bearer " prefix and surrounding whitespace must be stripped before
    // the raw token reaches the verifier.
    expect(verifier).toHaveBeenCalledWith('the-token');
  });

  it('rejects when Authorization header is missing', async () => {
    const g = makeGuard({ ...cfg, verifier: vi.fn() });
    await expect(g.canActivate(ctx({}))).rejects.toBeInstanceOf(PubSubInvalidTokenException);
  });

  it('rejects when the Authorization header is an array, not a string', async () => {
    const g = makeGuard({ ...cfg, verifier: vi.fn() });
    await expect(
      g.canActivate(ctx({ authorization: ['Bearer a', 'Bearer b'] })),
    ).rejects.toMatchObject({
      code: 'PUBSUB_INVALID_TOKEN',
      message: expect.stringContaining('malformed'),
    });
  });

  it('rejects when the Authorization header is not a Bearer scheme', async () => {
    const g = makeGuard({ ...cfg, verifier: vi.fn() });
    await expect(
      g.canActivate(ctx({ authorization: 'Basic dXNlcjpwYXNz' })),
    ).rejects.toMatchObject({
      code: 'PUBSUB_INVALID_TOKEN',
      message: expect.stringContaining('malformed'),
    });
  });

  it('rejects when the bearer token is empty after the prefix', async () => {
    const g = makeGuard({ ...cfg, verifier: vi.fn() });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer    ' })),
    ).rejects.toMatchObject({
      code: 'PUBSUB_INVALID_TOKEN',
      message: expect.stringContaining('empty bearer token'),
    });
  });

  it('rejects when the verifier throws, surfacing its message', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => {
        throw new Error('bad sig');
      }),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toMatchObject({
      code: 'PUBSUB_INVALID_TOKEN',
      message: expect.stringContaining('bad sig'),
    });
  });

  it('rejects when the verifier yields an empty payload', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({ getPayload: () => undefined })) as never,
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toMatchObject({
      code: 'PUBSUB_INVALID_TOKEN',
      message: expect.stringContaining('empty payload'),
    });
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
    ).rejects.toMatchObject({
      code: 'PUBSUB_INVALID_TOKEN',
      message: expect.stringContaining('unexpected issuer'),
    });
  });

  it('rejects when the token carries no numeric exp claim', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: cfg.audience,
          email: cfg.invokerSaEmail,
          // exp omitted — `typeof payload.exp !== 'number'` must reject it.
        }),
      })),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toMatchObject({
      code: 'PUBSUB_INVALID_TOKEN',
      message: expect.stringContaining('token expired'),
    });
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
    ).rejects.toMatchObject({
      code: 'PUBSUB_INVALID_TOKEN',
      message: expect.stringContaining('token expired'),
    });
  });
});

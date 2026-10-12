import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  API_FUNCTION_OPTIONS,
  assertProdSafeEnv,
  configureApp,
  isFunctionsRuntime,
  memoizeRetryableInit,
  readAllowedOrigins,
} from './app-setup';

describe('assertProdSafeEnv', () => {
  it('refuses the test outbox flag in production', () => {
    expect(() =>
      assertProdSafeEnv({ NODE_ENV: 'production', LEARNWREN_TEST_OUTBOX_ENABLED: '1' }),
    ).toThrow('Refusing to start: LEARNWREN_TEST_OUTBOX_ENABLED=1 is incompatible with NODE_ENV=production');
  });

  it.each([[{ NODE_ENV: 'production' }], [{ NODE_ENV: 'production', LEARNWREN_PUBLIC_URL: '  ' }]])(
    'refuses a production start without LEARNWREN_PUBLIC_URL (%j)',
    (env) => {
      expect(() => assertProdSafeEnv(env)).toThrow(
        'Refusing to start: LEARNWREN_PUBLIC_URL must be set in production',
      );
    },
  );

  it.each([
    [{ NODE_ENV: 'production', LEARNWREN_PUBLIC_URL: 'https://learnwren.com' }],
    [{ NODE_ENV: 'production', LEARNWREN_PUBLIC_URL: 'https://learnwren.com', LEARNWREN_TEST_OUTBOX_ENABLED: '0' }],
    [{ NODE_ENV: 'development', LEARNWREN_TEST_OUTBOX_ENABLED: '1' }],
    [{ LEARNWREN_TEST_OUTBOX_ENABLED: '1' }],
  ])('allows %j', (env) => {
    expect(() => assertProdSafeEnv(env)).not.toThrow();
  });
});

describe('readAllowedOrigins', () => {
  it('splits, trims and drops empty entries', () => {
    expect(
      readAllowedOrigins({ LEARNWREN_CORS_ORIGINS: ' https://a.example , ,https://b.example,' }),
    ).toEqual(['https://a.example', 'https://b.example']);
  });

  it('uses the configured list in production too', () => {
    expect(
      readAllowedOrigins({ NODE_ENV: 'production', LEARNWREN_CORS_ORIGINS: 'https://learnwren.com' }),
    ).toEqual(['https://learnwren.com']);
  });

  it.each([[{}], [{ LEARNWREN_CORS_ORIGINS: '' }], [{ LEARNWREN_CORS_ORIGINS: '   ' }]])(
    'defaults to the localhost dev origins outside production for %j',
    (env) => {
      expect(readAllowedOrigins(env)).toEqual(['http://localhost:4200', 'http://127.0.0.1:4200']);
    },
  );

  it.each([[{ NODE_ENV: 'production' }], [{ NODE_ENV: 'production', LEARNWREN_CORS_ORIGINS: ' ' }]])(
    'refuses to start in production without an allowlist (%j)',
    (env) => {
      expect(() => readAllowedOrigins(env)).toThrow(
        'Refusing to start: LEARNWREN_CORS_ORIGINS must be set in production',
      );
    },
  );
});

describe('isFunctionsRuntime', () => {
  it.each(['K_SERVICE', 'FUNCTIONS_EMULATOR', 'FUNCTIONS_CONTROL_API'])('is true when %s is set', (key) => {
    expect(isFunctionsRuntime({ [key]: 'x' })).toBe(true);
  });

  it('is false with none of them set, or set empty', () => {
    expect(isFunctionsRuntime({})).toBe(false);
    expect(isFunctionsRuntime({ K_SERVICE: '', FUNCTIONS_EMULATOR: '', FUNCTIONS_CONTROL_API: '' })).toBe(false);
  });
});

describe('memoizeRetryableInit', () => {
  it('runs init once for concurrent and later callers', async () => {
    const init = vi.fn(() => Promise.resolve());
    const ensure = memoizeRetryableInit(init);
    const first = ensure();
    expect(ensure()).toBe(first);
    await first;
    await ensure();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed init so the next call retries', async () => {
    const init = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('cold start blip'))
      .mockResolvedValue(undefined);
    const ensure = memoizeRetryableInit(init);
    await expect(ensure()).rejects.toThrow('cold start blip');
    await expect(ensure()).resolves.toBeUndefined();
    await ensure();
    expect(init).toHaveBeenCalledTimes(2);
  });
});

describe('API_FUNCTION_OPTIONS', () => {
  it('pins the deployed function shape', () => {
    expect(API_FUNCTION_OPTIONS).toEqual({
      region: 'us-central1',
      maxInstances: 10,
      memory: '512MiB',
      timeoutSeconds: 300,
      secrets: ['SMTP_PASS'],
    });
  });
});

@Controller('probe')
class ProbeController {
  @Post('echo')
  echo(@Body() body: unknown): unknown {
    return body;
  }

  @Get('whoami')
  whoami(@Req() req: Request): { ip: string | undefined; cookies: unknown } {
    return { ip: req.ip, cookies: req.cookies };
  }
}

describe('configureApp (over HTTP)', () => {
  const ORIGIN = 'https://app.example';
  let app: NestExpressApplication;
  let base: string;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    // bodyParser:false as in functions mode, so express.json here is the only parser.
    app = mod.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureApp(app, { LEARNWREN_CORS_ORIGINS: ORIGIN, LEARNWREN_TRUST_PROXY_HOPS: '1' });
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterEach(() => app.close());

  it('serves routes under the /api prefix only', async () => {
    expect((await fetch(`${base}/api/probe/whoami`)).status).toBe(200);
    expect((await fetch(`${base}/probe/whoami`)).status).toBe(404);
  });

  it('sets helmet security headers', async () => {
    const res = await fetch(`${base}/api/probe/whoami`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('parses JSON bodies up to 100kb and rejects larger ones with 413', async () => {
    const post = (size: number) =>
      fetch(`${base}/api/probe/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ s: 'x'.repeat(size) }),
      });
    const ok = await post(90 * 1024);
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { s: string }).s).toHaveLength(90 * 1024);
    expect((await post(110 * 1024)).status).toBe(413);
  });

  it('parses cookies', async () => {
    const res = await fetch(`${base}/api/probe/whoami`, { headers: { cookie: 'session=abc; other=1' } });
    expect(((await res.json()) as { cookies: unknown }).cookies).toEqual({ session: 'abc', other: '1' });
  });

  it('trusts the configured proxy hops for the client IP', async () => {
    const res = await fetch(`${base}/api/probe/whoami`, { headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.7' } });
    expect(((await res.json()) as { ip: string }).ip).toBe('198.51.100.7');
  });

  it('allows credentialed CORS from an allowlisted origin only', async () => {
    const allowed = await fetch(`${base}/api/probe/whoami`, { headers: { origin: ORIGIN } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    const other = await fetch(`${base}/api/probe/whoami`, { headers: { origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});

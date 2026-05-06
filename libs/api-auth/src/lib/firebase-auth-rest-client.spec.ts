import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIREBASE_WEB_API_KEY } from '@learnwren/api-firebase';

import {
  InternalAuthException,
  InvalidCredentialsException,
} from './errors/auth.exception';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';

const ORIGINAL_FETCH = global.fetch;

async function buildClient(apiKey = 'TEST_KEY') {
  const moduleRef = await Test.createTestingModule({
    providers: [
      FirebaseAuthRestClient,
      { provide: FIREBASE_WEB_API_KEY, useValue: apiKey },
    ],
  }).compile();
  return moduleRef.get(FirebaseAuthRestClient);
}

function mockFetchOk(body: unknown): void {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200 }),
  ) as unknown as typeof fetch;
}

function mockFetchErr(status: number, message: string): void {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ error: { message } }), { status }),
  ) as unknown as typeof fetch;
}

describe('FirebaseAuthRestClient.signInWithPassword', () => {
  beforeEach(() => {
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('uses the production URL when no emulator host is set', async () => {
    mockFetchOk({ idToken: 'tok', localId: 'uid', email: 'a@b.c', registered: true });
    const client = await buildClient('KEY');
    await client.signInWithPassword({ email: 'a@b.c', password: 'pw' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=KEY',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses the emulator URL when FIREBASE_AUTH_EMULATOR_HOST is set', async () => {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
    mockFetchOk({ idToken: 'tok', localId: 'uid', email: 'a@b.c', registered: true });
    const client = await buildClient('KEY');
    await client.signInWithPassword({ email: 'a@b.c', password: 'pw' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=KEY',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns the parsed body on 200', async () => {
    mockFetchOk({ idToken: 'TOKEN', localId: 'UID', email: 'a@b.c', registered: true });
    const client = await buildClient();
    const result = await client.signInWithPassword({ email: 'a@b.c', password: 'pw' });
    expect(result).toEqual({
      idToken: 'TOKEN',
      localId: 'UID',
      email: 'a@b.c',
      registered: true,
    });
  });

  it.each([
    ['EMAIL_NOT_FOUND'],
    ['INVALID_PASSWORD'],
    ['INVALID_LOGIN_CREDENTIALS'],
    ['USER_DISABLED'],
  ])('throws InvalidCredentialsException on %s', async (code) => {
    mockFetchErr(400, code);
    const client = await buildClient();
    await expect(
      client.signInWithPassword({ email: 'a@b.c', password: 'pw' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('throws InternalAuthException on unexpected error code', async () => {
    mockFetchErr(500, 'INTERNAL_ERROR');
    const client = await buildClient();
    await expect(
      client.signInWithPassword({ email: 'a@b.c', password: 'pw' }),
    ).rejects.toBeInstanceOf(InternalAuthException);
  });
});

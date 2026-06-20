import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PROFILE_PICTURE_DECODE_FAILED,
  PROFILE_PICTURE_DIMENSIONS_TOO_SMALL,
  PROFILE_PICTURE_TOO_LARGE,
  UNSUPPORTED_PROFILE_PICTURE_FORMAT,
} from '@learnwren/shared-data-models';

import { ProfilePictureService } from './profile-picture.service';

function file(bytes: number, type: string): File {
  return new File([new Uint8Array(bytes)], 'a.jpg', { type });
}

describe('ProfilePictureService', () => {
  let service: ProfilePictureService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProfilePictureService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ProfilePictureService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('validateLocally rejects non-JPEG/PNG with the format reason', () => {
    const v = service.validateLocally(file(10, 'image/gif'));
    expect(v.ok).toBe(false);
    // Pins the StringLiteral reason for the MIME branch.
    expect(v).toEqual({ ok: false, reason: 'Profile picture must be JPEG or PNG.' });
  });

  it('validateLocally accepts PNG (the second allowed MIME type)', () => {
    // Kills mutating the ALLOWED_MIME set / the MIME branch: PNG must pass.
    expect(service.validateLocally(file(1024, 'image/png'))).toEqual({ ok: true });
  });

  it('validateLocally rejects > 2 MB with the size reason', () => {
    const v = service.validateLocally(file(2_500_000, 'image/jpeg'));
    expect(v.ok).toBe(false);
    // Pins the StringLiteral reason for the size branch.
    expect(v).toEqual({ ok: false, reason: 'Profile picture must be 2 MB or smaller.' });
  });

  it('validateLocally accepts a file exactly at the 2 MB limit (boundary)', () => {
    // Kills `>`→`>=` on the size check: 2_000_000 is allowed, only strictly larger is rejected.
    expect(service.validateLocally(file(2_000_000, 'image/jpeg'))).toEqual({ ok: true });
  });

  it('validateLocally rejects one byte over the 2 MB limit (boundary)', () => {
    // Kills `>`→`<` / `>=`: 2_000_001 must be rejected.
    expect(service.validateLocally(file(2_000_001, 'image/jpeg')).ok).toBe(false);
  });

  it('validateLocally accepts a valid JPEG under 2 MB', () => {
    expect(service.validateLocally(file(1024, 'image/jpeg'))).toEqual({ ok: true });
  });

  it('upload posts multipart to PUT /api/profile/picture with field name "file" and withCredentials, returning the snapshot', async () => {
    const promise = service.upload(file(1024, 'image/jpeg'));
    const req = http.expectOne('/api/profile/picture');
    expect(req.request.method).toBe('PUT');
    expect(req.request.url).toBe('/api/profile/picture');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).has('file')).toBe(true);
    // Pins the request-options ObjectLiteral / withCredentials boolean.
    expect(req.request.withCredentials).toBe(true);
    req.flush({
      uid: 'u1',
      email: 'a@b.com',
      displayName: 'Ada',
      role: 'STUDENT',
      emailVerified: true,
      photoUrl: 'https://x/avatar.jpg?v=1',
    });
    const me = await promise;
    expect(me.photoUrl).toContain('avatar.jpg');
  });

  it('upload maps 400 PROFILE_PICTURE_DIMENSIONS_TOO_SMALL into a typed error', async () => {
    const p = service.upload(file(1024, 'image/jpeg')).catch((e) => e);
    http.expectOne('/api/profile/picture').flush(
      {
        error: {
          code: PROFILE_PICTURE_DIMENSIONS_TOO_SMALL,
          message: 'too small',
          details: { width: 200, height: 200 },
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    const err = await p;
    expect(err.code).toBe(PROFILE_PICTURE_DIMENSIONS_TOO_SMALL);
    expect(err.details).toEqual({ width: 200, height: 200 });
  });

  it('upload maps 413 / 415 / decode-failed into typed errors', async () => {
    for (const [status, code] of [
      [413, PROFILE_PICTURE_TOO_LARGE],
      [415, UNSUPPORTED_PROFILE_PICTURE_FORMAT],
      [400, PROFILE_PICTURE_DECODE_FAILED],
    ] as const) {
      const p = service.upload(file(1024, 'image/jpeg')).catch((e) => e);
      http
        .expectOne('/api/profile/picture')
        .flush({ error: { code, message: 'x' } }, { status, statusText: 'x' });
      const err = await p;
      expect(err.code).toBe(code);
    }
  });

  it('upload maps an error body with a message into the typed error message', async () => {
    const p = service.upload(file(1024, 'image/jpeg')).catch((e) => e);
    http.expectOne('/api/profile/picture').flush(
      { error: { code: UNSUPPORTED_PROFILE_PICTURE_FORMAT, message: 'nope', details: { mime: 'image/gif' } } },
      { status: 415, statusText: 'x' },
    );
    const err = await p;
    expect(err.code).toBe(UNSUPPORTED_PROFILE_PICTURE_FORMAT);
    expect(err.message).toBe('nope');
    expect(err.details).toEqual({ mime: 'image/gif' });
  });

  it('upload falls back to the default message when the error body omits a message', async () => {
    const p = service.upload(file(1024, 'image/jpeg')).catch((e) => e);
    http.expectOne('/api/profile/picture').flush(
      { error: { code: PROFILE_PICTURE_TOO_LARGE } },
      { status: 413, statusText: 'x' },
    );
    const err = await p;
    // Pins the `?? 'Profile picture upload failed.'` fallback StringLiteral.
    expect(err.message).toBe('Profile picture upload failed.');
  });

  it('upload maps a body without an error.code into an UNKNOWN/Network error typed error', async () => {
    const p = service.upload(file(1024, 'image/jpeg')).catch((e) => e);
    // No `error.error.code` → the toTyped guard fails and the UNKNOWN branch runs.
    http.expectOne('/api/profile/picture').flush(
      { something: 'else' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    const err = await p;
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('Network error.');
  });

  it('remove sends DELETE to the exact URL with withCredentials and returns the snapshot', async () => {
    const promise = service.remove();
    const req = http.expectOne('/api/profile/picture');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.url).toBe('/api/profile/picture');
    expect(req.request.withCredentials).toBe(true);
    req.flush({
      uid: 'u1',
      email: 'a@b.com',
      displayName: 'Ada',
      role: 'STUDENT',
      emailVerified: true,
    });
    const me = await promise;
    expect(me.photoUrl).toBeUndefined();
  });

  it('remove maps a coded error body into a typed error', async () => {
    const p = service.remove().catch((e) => e);
    http.expectOne('/api/profile/picture').flush(
      { error: { code: PROFILE_PICTURE_DECODE_FAILED, message: 'bad' } },
      { status: 400, statusText: 'Bad Request' },
    );
    const err = await p;
    expect(err.code).toBe(PROFILE_PICTURE_DECODE_FAILED);
  });

  it('remove falls back to UNKNOWN when the error body lacks a code', async () => {
    const p = service.remove().catch((e) => e);
    http.expectOne('/api/profile/picture').flush({}, { status: 500, statusText: 'x' });
    const err = await p;
    expect(err.code).toBe('UNKNOWN');
  });

  it('typed error carries the name "ProfilePictureError"', async () => {
    // Kills the StringLiteral on `this.name = 'ProfilePictureError'` (L20).
    const p = service.upload(file(1024, 'image/jpeg')).catch((e) => e);
    http.expectOne('/api/profile/picture').flush(
      { error: { code: PROFILE_PICTURE_TOO_LARGE, message: 'x' } },
      { status: 413, statusText: 'x' },
    );
    const err = await p;
    expect(err.name).toBe('ProfilePictureError');
  });

  it('falls back to UNKNOWN when the HttpErrorResponse body is null (kills the err.error?. optional-chaining)', async () => {
    // `err.error?.error?.code` → mutant `err.error.error?.code`: when `err.error`
    // is null the original short-circuits to undefined; the mutant would throw a
    // TypeError reading `.error` of null. A clean UNKNOWN result proves the chain.
    const p = service.upload(file(1024, 'image/jpeg')).catch((e) => e);
    http
      .expectOne('/api/profile/picture')
      .flush(null, { status: 500, statusText: 'x' });
    const err = await p;
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('Network error.');
  });

  it('falls back to UNKNOWN when error.error exists but has no code (kills the ?.code optional-chaining)', async () => {
    // `err.error?.error?.code` → mutant `err.error?.error`: the inner object is
    // truthy but `.code` is absent. Original: code undefined → UNKNOWN/Network.
    // Mutant: enters the typed branch with code === undefined. Different result.
    const p = service.upload(file(1024, 'image/jpeg')).catch((e) => e);
    http.expectOne('/api/profile/picture').flush(
      { error: { error: { message: 'no code here' } } },
      { status: 500, statusText: 'x' },
    );
    const err = await p;
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('Network error.');
  });
});

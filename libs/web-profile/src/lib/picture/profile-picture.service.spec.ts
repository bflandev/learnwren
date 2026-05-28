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

  it('validateLocally rejects non-JPEG/PNG', () => {
    expect(service.validateLocally(file(10, 'image/gif')).ok).toBe(false);
  });

  it('validateLocally rejects > 2 MB', () => {
    expect(service.validateLocally(file(2_500_000, 'image/jpeg')).ok).toBe(false);
  });

  it('validateLocally accepts a valid JPEG under 2 MB', () => {
    expect(service.validateLocally(file(1024, 'image/jpeg'))).toEqual({ ok: true });
  });

  it('upload posts multipart to PUT /api/profile/picture with field name "file" and returns the snapshot', async () => {
    const promise = service.upload(file(1024, 'image/jpeg'));
    const req = http.expectOne('/api/profile/picture');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).has('file')).toBe(true);
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

  it('remove sends DELETE and returns the snapshot', async () => {
    const promise = service.remove();
    const req = http.expectOne('/api/profile/picture');
    expect(req.request.method).toBe('DELETE');
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
});

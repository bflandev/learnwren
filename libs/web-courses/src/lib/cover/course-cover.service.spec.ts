import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CourseId } from '@learnwren/shared-data-models';

import { CourseCoverService } from './course-cover.service';

const CID = 'c1' as CourseId;

describe('CourseCoverService', () => {
  let svc: CourseCoverService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CourseCoverService,
      ],
    });
    svc = TestBed.inject(CourseCoverService);
    http = TestBed.inject(HttpTestingController);
  });

  it('PUTs multipart/form-data with field "file" to /api/courses/:id/cover', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.jpg', { type: 'image/jpeg' });
    const p = svc.upload(CID, file);
    const req = http.expectOne(`/api/courses/${CID}/cover`);
    expect(req.request.method).toBe('PUT');
    const body = req.request.body as FormData;
    expect(body.has('file')).toBe(true);
    expect((body.get('file') as File).name).toBe('cover.jpg');
    req.flush({
      coverImageUrl: 'https://cdn/x.jpg?v=1',
      updatedAt: '2026-05-25T12:00:00.000Z',
    });
    await expect(p).resolves.toEqual({
      coverImageUrl: 'https://cdn/x.jpg?v=1',
      updatedAt: '2026-05-25T12:00:00.000Z',
    });
  });

  it('DELETEs /api/courses/:id/cover', async () => {
    const p = svc.remove(CID);
    const req = http.expectOne(`/api/courses/${CID}/cover`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await expect(p).resolves.toBeUndefined();
  });

  it('validateLocally rejects non-jpeg/png', () => {
    const f = new File([new Uint8Array([0])], 'x.gif', { type: 'image/gif' });
    const r = svc.validateLocally(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/JPEG or PNG/);
  });

  it('validateLocally rejects files over 10 MB', () => {
    const f = new File([new Uint8Array(10_000_001)], 'x.jpg', { type: 'image/jpeg' });
    const r = svc.validateLocally(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/10 MB/);
  });

  it('validateLocally accepts a 1 KB JPEG', () => {
    const f = new File([new Uint8Array(1024)], 'x.jpg', { type: 'image/jpeg' });
    expect(svc.validateLocally(f)).toEqual({ ok: true });
  });
});

import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import { CaptionsService } from './captions.service';

describe('CaptionsService (web-courses)', () => {
  let svc: CaptionsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CaptionsService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(CaptionsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('uploads via PUT multipart', async () => {
    const p = svc.upload('v1' as VideoId, new File(['WEBVTT'], 'c.vtt', { type: 'text/vtt' }));
    const req = http.expectOne('/api/videos/v1/captions');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush({ language: 'en', label: 'English', updatedAt: 'now' });
    expect((await p).label).toBe('English');
  });

  it('reads metadata via GET', async () => {
    const p = svc.getMeta('v1' as VideoId);
    http.expectOne('/api/videos/v1/captions').flush(null);
    expect(await p).toBeNull();
  });

  it('removes via DELETE', async () => {
    const p = svc.remove('v1' as VideoId);
    const req = http.expectOne('/api/videos/v1/captions');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await p;
  });

  it('validateLocally accepts a valid small vtt file', () => {
    const file = new File(['WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello'], 'c.vtt', { type: 'text/vtt' });
    expect(svc.validateLocally(file).ok).toBe(true);
  });

  it('validateLocally rejects a non-vtt file', () => {
    expect(svc.validateLocally(new File(['x'], 'a.txt', { type: 'text/plain' })).ok).toBe(false);
  });

  it('validateLocally rejects an oversized vtt file', () => {
    const big = new File([new Uint8Array(256_001)], 'big.vtt', { type: 'text/vtt' });
    expect(big.size > 256000).toBe(true); // ensure the size branch fires
    expect(svc.validateLocally(big).ok).toBe(false);
  });
});

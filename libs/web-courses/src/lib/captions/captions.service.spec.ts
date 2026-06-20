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

  it('uploads via PUT multipart with credentials and a "file" field', async () => {
    const p = svc.upload('v1' as VideoId, new File(['WEBVTT'], 'c.vtt', { type: 'text/vtt' }));
    const req = http.expectOne('/api/videos/v1/captions');
    expect(req.request.method).toBe('PUT');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body instanceof FormData).toBe(true);
    const body = req.request.body as FormData;
    expect(body.has('file')).toBe(true);
    expect((body.get('file') as File).name).toBe('c.vtt');
    req.flush({ language: 'en', label: 'English', updatedAt: 'now' });
    expect((await p).label).toBe('English');
  });

  it('reads metadata via GET with credentials', async () => {
    const p = svc.getMeta('v1' as VideoId);
    const req = http.expectOne('/api/videos/v1/captions');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(null);
    expect(await p).toBeNull();
  });

  it('removes via DELETE with credentials', async () => {
    const p = svc.remove('v1' as VideoId);
    const req = http.expectOne('/api/videos/v1/captions');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.withCredentials).toBe(true);
    req.flush(null);
    await p;
  });

  it('validateLocally accepts a valid small vtt file', () => {
    const file = new File(['WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello'], 'c.vtt', { type: 'text/vtt' });
    expect(svc.validateLocally(file)).toEqual({ ok: true });
  });

  it('validateLocally accepts a file named .vtt even when the MIME type is not text/vtt', () => {
    // name matches /\.vtt$/i so the && short-circuits to accept.
    const file = new File(['WEBVTT'], 'subs.vtt', { type: 'application/octet-stream' });
    expect(svc.validateLocally(file)).toEqual({ ok: true });
  });

  it('validateLocally accepts a text/vtt file even when the name is not .vtt', () => {
    // type === text/vtt so the second clause is false -> overall accept.
    const file = new File(['WEBVTT'], 'subtitles', { type: 'text/vtt' });
    expect(svc.validateLocally(file)).toEqual({ ok: true });
  });

  it('validateLocally rejects a file whose name only CONTAINS .vtt but does not END in it', () => {
    // Anchored regex: ".vtt.txt" must NOT match /\.vtt$/i; type also not text/vtt.
    const file = new File(['x'], 'c.vtt.txt', { type: 'text/plain' });
    const r = svc.validateLocally(file);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('Captions must be a WebVTT (.vtt) file.');
  });

  it('validateLocally rejects a non-vtt file with the exact reason', () => {
    const r = svc.validateLocally(new File(['x'], 'a.txt', { type: 'text/plain' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('Captions must be a WebVTT (.vtt) file.');
  });

  it('validateLocally accepts a vtt file at exactly the 256 KB limit (boundary)', () => {
    const atLimit = new File([new Uint8Array(256_000)], 'edge.vtt', { type: 'text/vtt' });
    expect(svc.validateLocally(atLimit)).toEqual({ ok: true });
  });

  it('validateLocally rejects an oversized vtt file with the exact reason', () => {
    const big = new File([new Uint8Array(256_001)], 'big.vtt', { type: 'text/vtt' });
    expect(big.size > 256000).toBe(true); // ensure the size branch fires
    const r = svc.validateLocally(big);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('Caption file exceeds the 256 KB limit.');
  });
});

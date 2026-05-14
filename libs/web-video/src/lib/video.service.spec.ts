import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VideoService } from './video.service';

describe('VideoService', () => {
  let svc: VideoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        VideoService,
      ],
    });
    svc = TestBed.inject(VideoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs upload-session under courses/lesson path with credentials', () => {
    svc
      .createUploadSession('c1' as never, 'm1' as never, 'l1' as never, {
        sizeBytes: 1,
        contentType: 'video/mp4',
      })
      .subscribe();
    const req = http.expectOne(
      '/api/courses/c1/modules/m1/lessons/l1/video/upload-session',
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ videoId: 'v1', uploadSessionUri: 'u', expiresAt: 'e' });
  });

  it('POSTs upload-complete', () => {
    svc.completeUpload('v1' as never).subscribe();
    const req = http.expectOne('/api/videos/v1/upload-complete');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'v1', state: 'UPLOADED' });
  });

  it('PATCHes failed', () => {
    svc.markFailed('v1' as never, 'reason').subscribe();
    const req = http.expectOne('/api/videos/v1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ state: 'FAILED', failureReason: 'reason' });
    req.flush({ id: 'v1', state: 'FAILED' });
  });

  it('GETs video', () => {
    svc.getVideo('v1' as never).subscribe();
    const req = http.expectOne('/api/videos/v1');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'v1', state: 'PENDING_UPLOAD' });
  });

  it('DELETEs video', () => {
    svc.delete('v1' as never).subscribe();
    const req = http.expectOne('/api/videos/v1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});

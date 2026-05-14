import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import { VideoStatePollingService } from './video-state-polling.service';

function video(state: Video['state'], overrides: Partial<Video> = {}): Video {
  return {
    id: 'v1' as VideoId,
    ownerInstructorId: 'u1' as Video['ownerInstructorId'],
    courseId: 'c1' as Video['courseId'],
    lessonId: 'l1' as Video['lessonId'],
    state,
    source: { bucket: 'b', path: 'p' },
    createdAt: '2026-05-13T00:00:00.000Z' as Video['createdAt'],
    updatedAt: '2026-05-13T00:00:00.000Z' as Video['updatedAt'],
    ...overrides,
  };
}

describe('VideoStatePollingService', () => {
  let svc: VideoStatePollingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoStatePollingService],
    });
    svc = TestBed.inject(VideoStatePollingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('emits the initial video then polls until READY', async () => {
    const collected: Video['state'][] = [];
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 60_000 }).subscribe((v) => {
      collected.push(v.state);
    });

    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    await new Promise((r) => setTimeout(r, 20));
    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    await new Promise((r) => setTimeout(r, 20));
    httpMock.expectOne('/api/videos/v1').flush(video('READY'));
    await new Promise((r) => setTimeout(r, 30));

    expect(collected.at(-1)).toBe('READY');
    httpMock.verify();
    sub.unsubscribe();
  });

  it('stops polling on FAILED', async () => {
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 60_000 }).subscribe();
    httpMock.expectOne('/api/videos/v1').flush(video('FAILED'));
    await new Promise((r) => setTimeout(r, 50));
    httpMock.verify();
    sub.unsubscribe();
  });

  it('stops polling after the cap', async () => {
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 30 }).subscribe();
    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    await new Promise((r) => setTimeout(r, 15));
    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    await new Promise((r) => setTimeout(r, 60));
    httpMock.verify();
    sub.unsubscribe();
  });

  it('stops polling when subscriber unsubscribes', async () => {
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 60_000 }).subscribe();
    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    sub.unsubscribe();
    await new Promise((r) => setTimeout(r, 30));
    httpMock.verify();
  });
});

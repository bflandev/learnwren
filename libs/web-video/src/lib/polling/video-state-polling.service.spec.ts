import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';

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

  it('sends the request with credentials (first-party session cookie)', () => {
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 60_000 }).subscribe();
    const req = httpMock.expectOne('/api/videos/v1');
    // Kills the ObjectLiteral → {} and BooleanLiteral true → false mutants on the
    // get(..., { withCredentials: true }) options object.
    expect(req.request.withCredentials).toBe(true);
    req.flush(video('READY'));
    sub.unsubscribe();
  });

  it('does NOT poll again after a terminal READY first response', async () => {
    const collected: Video['state'][] = [];
    const sub = svc
      .poll('v1' as VideoId, { intervalMs: 10, capMs: 60_000 })
      .subscribe((v) => collected.push(v.state));
    // First (and only) response is already terminal → the expand() must return
    // EMPTY and schedule no follow-up request. Kills the L29 terminal-check mutant.
    httpMock.expectOne('/api/videos/v1').flush(video('READY'));
    await new Promise((r) => setTimeout(r, 40));
    httpMock.verify(); // would throw if a second request was scheduled
    expect(collected).toEqual(['READY']);
    sub.unsubscribe();
  });
});

describe('VideoStatePollingService — cap boundary (Date.now harness)', () => {
  let svc: VideoStatePollingService;
  let httpMock: HttpTestingController;
  const START = 1_000_000;
  // `vi.useFakeTimers()` also fakes Date, so drive Date.now via setSystemTime
  // (a plain spy is clobbered by the fake-timers Date replacement).
  const setNow = (ms: number): void => vi.setSystemTime(ms);
  const bumpNow = (delta: number): void => vi.setSystemTime(Date.now() + delta);

  beforeEach(() => {
    vi.useFakeTimers();
    setNow(START);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), VideoStatePollingService],
    });
    svc = TestBed.inject(VideoStatePollingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules another poll when elapsed + 2*interval is EXACTLY equal to capMs (strict >, not >=)', async () => {
    // intervalMs=10, capMs=20. start = now (1_000_000). After the first response,
    // advance Date.now by 0 so elapsed=0 → 0 + 10*2 = 20, which is NOT > 20.
    // The strict `>` keeps polling; a `>=` mutant would stop here.
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 20 }).subscribe();
    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    // elapsed === 0 (Date.now unchanged) → budget check passes → timer(10) fires.
    await vi.advanceTimersByTimeAsync(10);
    httpMock.expectOne('/api/videos/v1').flush(video('READY'));
    httpMock.verify();
    sub.unsubscribe();
  });

  it('stops polling once elapsed + 2*interval EXCEEDS capMs', async () => {
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 20 }).subscribe();
    const req = httpMock.expectOne('/api/videos/v1');
    // expand() reads Date.now() when the response arrives — push elapsed to 1ms
    // BEFORE flushing so 1 + 20 = 21 > 20 → no further request is scheduled.
    bumpNow(1);
    req.flush(video('TRANSCODING'));
    await vi.advanceTimersByTimeAsync(100);
    httpMock.verify();
    sub.unsubscribe();
  });

  it('uses the DEFAULT 30-minute cap when capMs is omitted', async () => {
    // No capMs → DEFAULT_CAP_MS = 30 * 60 * 1000 = 1_800_000. With intervalMs=10
    // and start=1_000_000, set elapsed just under the default cap budget so a
    // poll IS still scheduled (proves the cap is the 30*60*1000 product, not a
    // divided/smaller value which would stop polling).
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10 }).subscribe();
    const req = httpMock.expectOne('/api/videos/v1');
    // elapsed pushed to 1_799_900 → 1_799_900 + 20 = 1_799_920 < 1_800_000 → keep polling.
    bumpNow(1_799_900);
    req.flush(video('TRANSCODING'));
    await vi.advanceTimersByTimeAsync(10);
    httpMock.expectOne('/api/videos/v1').flush(video('READY'));
    httpMock.verify();
    sub.unsubscribe();
  });

  it('stops at the DEFAULT cap when the budget is exhausted (pins 30*60*1000 arithmetic)', async () => {
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10 }).subscribe();
    const req = httpMock.expectOne('/api/videos/v1');
    // elapsed pushed past the default budget: 1_799_990 + 20 = 1_800_010 > 1_800_000.
    // A `30 * 60 / 1000` (=1.8) or `30 / 60` cap would have stopped FAR earlier,
    // but the previous test already proved polling continues to ~1.8M elapsed,
    // so only the full 30*60*1000 product yields this stop point.
    bumpNow(1_799_990);
    req.flush(video('TRANSCODING'));
    await vi.advanceTimersByTimeAsync(100);
    httpMock.verify();
    sub.unsubscribe();
  });
});

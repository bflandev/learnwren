import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateUploadSessionResponse } from '../video.service';
import { VideoService } from '../video.service';
import { VideoUploadService, XHR_FACTORY } from './video-upload.service';

class FakeXhr {
  upload = { onprogress: undefined as ((e: ProgressEvent) => void) | undefined };
  status = 0;
  onload: (() => void) | undefined;
  onerror: (() => void) | undefined;
  abort = vi.fn();
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
}

function makeVideoSvc() {
  return {
    createUploadSession: vi.fn(),
    completeUpload: vi.fn(),
    markFailed: vi.fn(),
    delete: vi.fn(),
    getVideo: vi.fn(),
  };
}

describe('VideoUploadService', () => {
  let svc: VideoUploadService;
  let api: ReturnType<typeof makeVideoSvc>;
  let xhrs: FakeXhr[];

  beforeEach(() => {
    xhrs = [];
    api = makeVideoSvc();

    TestBed.configureTestingModule({
      providers: [
        VideoUploadService,
        // Provide a mock VideoService to avoid needing HttpClient
        { provide: VideoService, useValue: api },
        {
          provide: XHR_FACTORY,
          useValue: () => {
            const x = new FakeXhr();
            xhrs.push(x);
            return x;
          },
        },
      ],
    });
    svc = TestBed.inject(VideoUploadService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts at idle', () => {
    expect(svc.state()).toEqual({ kind: 'idle' });
  });

  it('rejects oversized files at picker time without any network', () => {
    const file = new File([new Uint8Array(10)], 'big.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 10_000_000_001 });
    svc.selectFile(file);
    expect(svc.state()).toEqual({ kind: 'failed', reason: expect.stringContaining('10 GB') });
  });

  it('rejects unsupported MIME at picker time', () => {
    const file = new File(['x'], 'doc.txt', { type: 'text/plain' });
    svc.selectFile(file);
    expect(svc.state()).toEqual({ kind: 'failed', reason: expect.stringContaining('Unsupported') });
  });

  it('progresses to creating-session, uploading, finalizing, complete', async () => {
    const sessionResp: CreateUploadSessionResponse = {
      videoId: 'v1' as never,
      uploadSessionUri: 'https://session',
      expiresAt: 'e',
    };
    api.createUploadSession.mockReturnValue(of(sessionResp));
    api.completeUpload.mockReturnValue(of({ id: 'v1', state: 'UPLOADED' }));

    const file = new File([new Uint8Array(8)], 'demo.mp4', { type: 'video/mp4' });
    const done = svc.start(
      { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never },
      file,
    );

    // creating-session state transitions synchronously before first await in start()
    expect(svc.state().kind).toBe('creating-session');

    // Tick the microtask queue so firstValueFrom(createUploadSession) resolves
    await Promise.resolve();
    expect(svc.state().kind).toBe('uploading');

    // Drive the XHR fake to completion
    const x = xhrs.at(-1)!;
    x.status = 200;
    x.onload!();

    // Multiple microtask ticks allow the async chain (putChunk → putChunkWithRetry →
    // uploadAllChunks → completeUpload Promise) to settle.
    await done;
    expect(svc.state()).toEqual(expect.objectContaining({ kind: 'complete', videoId: 'v1' }));
  });

  it('retries a transient 5xx up to 3 times then advances to failed', async () => {
    vi.useFakeTimers();
    try {
      api.createUploadSession.mockReturnValue(
        of({ videoId: 'v1' as never, uploadSessionUri: 'u', expiresAt: 'e' }),
      );
      api.markFailed.mockReturnValue(of({ id: 'v1', state: 'FAILED' }));

      const file = new File([new Uint8Array(8)], 'demo.mp4', { type: 'video/mp4' });
      const promise = svc.start(
        { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never },
        file,
      );
      await Promise.resolve(); // session resolves

      // 4 attempts: 3 retries (with backoff) + 1 final failure
      for (let i = 0; i < 4; i++) {
        const x = xhrs.at(-1)!;
        x.status = 503;
        x.onload!();
        // Advance past the backoff setTimeout, then drain microtasks
        await vi.runAllTimersAsync();
        await Promise.resolve();
      }

      await Promise.resolve();
      const settled = await Promise.race([
        promise.then(() => 'done'),
        new Promise<string>((r) => setTimeout(() => r('timeout'), 100)),
      ]);
      vi.runAllTimers();
      await promise;
      expect(settled).toBe('done');
      expect(svc.state().kind).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel aborts XHR and calls DELETE', async () => {
    api.createUploadSession.mockReturnValue(
      of({ videoId: 'v1' as never, uploadSessionUri: 'u', expiresAt: 'e' }),
    );
    api.delete.mockReturnValue(of(undefined));

    const file = new File([new Uint8Array(4)], 'demo.mp4', { type: 'video/mp4' });
    const p = svc.start(
      { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never },
      file,
    );
    await Promise.resolve(); // session resolves
    expect(svc.state().kind).toBe('uploading');

    // cancel() aborts XHR and sets aborted flag; we must also simulate the XHR
    // triggering onerror (as real abort does) so the putChunk Promise resolves
    // and start() can complete.
    const x = xhrs.at(-1)!;
    x.abort.mockImplementation(() => {
      x.status = 0;
      x.onerror?.();
    });

    await svc.cancel();
    expect(x.abort).toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith('v1');
    await p;
    expect(svc.state().kind).toBe('idle');
  });
});

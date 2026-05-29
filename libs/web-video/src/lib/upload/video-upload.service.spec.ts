import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateUploadSessionResponse } from '../video.service';
import { VideoService } from '../video.service';
import { VideoUploadService, XHR_FACTORY } from './video-upload.service';

class FakeXhr {
  upload = { onprogress: undefined as ((e: ProgressEvent) => void) | undefined };
  status = 0;
  onload: (() => void) | undefined;
  onerror: (() => void) | undefined;
  onabort: (() => void) | undefined;
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
    // triggering onabort (as real browsers do) so the putChunk Promise resolves
    // and start() can complete.
    const x = xhrs.at(-1)!;
    x.abort.mockImplementation(() => {
      x.status = 0;
      x.onabort?.();
    });

    await svc.cancel();
    expect(x.abort).toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith('v1');
    await p;
    expect(svc.state().kind).toBe('idle');
  });

  it('onabort resolves putChunk (real-browser abort path)', async () => {
    // Verify that triggering onabort (not onerror) resolves putChunk so start()
    // does not hang after cancel().
    api.createUploadSession.mockReturnValue(
      of({ videoId: 'v2' as never, uploadSessionUri: 'u', expiresAt: 'e' }),
    );
    api.delete.mockReturnValue(of(undefined));

    const file = new File([new Uint8Array(4)], 'demo.mp4', { type: 'video/mp4' });
    const p = svc.start(
      { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never },
      file,
    );
    await Promise.resolve(); // session resolves → uploading

    const x = xhrs.at(-1)!;
    // Wire abort to fire onabort only (no onerror), matching real browsers
    x.abort.mockImplementation(() => {
      x.status = 0;
      x.onabort?.();
    });

    await svc.cancel();
    // start() must complete (not hang) — await with a race so the test fails fast
    const result = await Promise.race([
      p.then(() => 'done'),
      new Promise<string>((r) => setTimeout(() => r('timeout'), 500)),
    ]);
    expect(result).toBe('done');
    expect(svc.state().kind).toBe('idle');
  });

  it('multi-chunk upload sends correct Content-Range per chunk', async () => {
    api.createUploadSession.mockReturnValue(
      of({ videoId: 'v3' as never, uploadSessionUri: 'https://session', expiresAt: 'e' }),
    );
    api.completeUpload.mockReturnValue(of({ id: 'v3', state: 'UPLOADED' }));

    // CHUNK_BYTES = 8 MiB = 8_388_608; use a slightly-larger file to force 2 chunks
    const CHUNK = 8 * 1024 * 1024; // 8_388_608
    const totalSize = CHUNK + 100;  // chunk0: bytes 0..(CHUNK-1), chunk1: bytes CHUNK..(totalSize-1)
    const file = new File([new Uint8Array(totalSize)], 'big.mp4', { type: 'video/mp4' });

    // Helper: drain the microtask queue several times
    const drain = async (n = 5) => {
      for (let i = 0; i < n; i++) await Promise.resolve();
    };

    const done = svc.start(
      { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never },
      file,
    );
    await drain(); // session resolves → uploading, first XHR created

    // Drive chunk 0 (bytes 0–8388607)
    expect(xhrs.length).toBeGreaterThanOrEqual(1);
    const x0 = xhrs[0];
    x0.status = 308; // GCS "Resume Incomplete"
    x0.onload!();

    await drain(); // putChunk resolves → second XHR created

    // Drive chunk 1 (bytes 8388608–8388707)
    expect(xhrs.length).toBeGreaterThanOrEqual(2);
    const x1 = xhrs[1];
    x1.status = 200;
    x1.onload!();

    await done;

    // Verify Content-Range headers for both chunks
    const rangeFor = (x: FakeXhr) => {
      const call = (x.setRequestHeader.mock.calls as string[][]).find(
        (c) => c[0] === 'Content-Range',
      );
      return call?.[1];
    };

    expect(rangeFor(x0)).toBe(`bytes 0-${CHUNK - 1}/${totalSize}`);
    expect(rangeFor(x1)).toBe(`bytes ${CHUNK}-${totalSize - 1}/${totalSize}`);
    expect(svc.state()).toEqual(expect.objectContaining({ kind: 'complete', videoId: 'v3' }));
  });

  it('reports a failure with the underlying message when createUploadSession fails', async () => {
    api.createUploadSession.mockReturnValue(throwError(() => new Error('quota exceeded')));

    const file = new File([new Uint8Array(4)], 'demo.mp4', { type: 'video/mp4' });
    await svc.start(
      { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never },
      file,
    );
    expect(svc.state()).toEqual({
      kind: 'failed',
      reason: 'quota exceeded',
    });
  });

  it('falls back to a generic message when the create-session error has no message field', async () => {
    api.createUploadSession.mockReturnValue(throwError(() => 'opaque'));

    const file = new File([new Uint8Array(4)], 'demo.mp4', { type: 'video/mp4' });
    await svc.start(
      { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never },
      file,
    );
    expect(svc.state()).toEqual({
      kind: 'failed',
      reason: 'Unknown error.',
    });
  });

  it('reports a failure with the videoId when completeUpload fails', async () => {
    api.createUploadSession.mockReturnValue(
      of({ videoId: 'v9' as never, uploadSessionUri: 'u', expiresAt: 'e' }),
    );
    api.completeUpload.mockReturnValue(throwError(() => new Error('finalize boom')));

    const file = new File([new Uint8Array(8)], 'demo.mp4', { type: 'video/mp4' });
    const done = svc.start(
      { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never },
      file,
    );
    await Promise.resolve(); // session resolves → uploading
    const x = xhrs.at(-1)!;
    x.status = 200;
    x.onload!();
    await done;
    expect(svc.state()).toEqual({
      kind: 'failed',
      reason: 'finalize boom',
      videoId: 'v9',
    });
  });

  it('retry() clears the failed state to idle after deleting the failed video', async () => {
    api.createUploadSession.mockReturnValue(
      of({ videoId: 'v5' as never, uploadSessionUri: 'u', expiresAt: 'e' }),
    );
    api.markFailed.mockReturnValue(of({ id: 'v5', state: 'FAILED' }));
    api.delete.mockReturnValue(of(undefined));
    vi.useFakeTimers();
    try {
      const file = new File([new Uint8Array(4)], 'demo.mp4', { type: 'video/mp4' });
      const p = svc.start(
        { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never },
        file,
      );
      await Promise.resolve();
      // Force a hard 4xx failure to push state to failed with videoId
      for (let i = 0; i < 4; i++) {
        const x = xhrs.at(-1)!;
        x.status = 403;
        x.onload!();
        await vi.runAllTimersAsync();
        await Promise.resolve();
      }
      await p;
      expect(svc.state().kind).toBe('failed');
    } finally {
      vi.useRealTimers();
    }

    await svc.retry();
    expect(api.delete).toHaveBeenCalledWith('v5');
    expect(svc.state()).toEqual({ kind: 'idle' });
  });

  it('retry() is a no-op when the state is not failed', async () => {
    await svc.retry();
    expect(svc.state()).toEqual({ kind: 'idle' });
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('cancel from idle leaves state at idle and does not call DELETE', async () => {
    await svc.cancel();
    expect(svc.state()).toEqual({ kind: 'idle' });
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('cancel during creating-session sets idle and calls DELETE on minted session', async () => {
    // Simulate cancel() firing while awaiting createUploadSession
    let resolveSession!: (v: unknown) => void;
    const sessionPromise = new Promise((res) => { resolveSession = res; });
    api.createUploadSession.mockReturnValue({ subscribe: (obs: { next: (v: unknown) => void; complete: () => void }) => {
      sessionPromise.then((v) => { obs.next(v); obs.complete(); });
      return { unsubscribe: () => undefined };
    }});
    api.delete.mockReturnValue(of(undefined));

    const file = new File([new Uint8Array(4)], 'demo.mp4', { type: 'video/mp4' });
    const p = svc.start(
      { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never },
      file,
    );

    // State is now creating-session (before session resolves)
    expect(svc.state().kind).toBe('creating-session');

    // cancel() runs while session is still pending → sets aborted = true
    const cancelDone = svc.cancel();
    // Since state is creating-session (not uploading/finalizing/failed), cancel
    // goes straight to idle without calling DELETE for the session video.
    await cancelDone;
    expect(svc.state().kind).toBe('idle');

    // Now flush the session response
    resolveSession({ videoId: 'v4' as never, uploadSessionUri: 'u', expiresAt: 'e' });
    await p;

    // start() must detect aborted flag, call DELETE on the minted session, and stay idle
    expect(api.delete).toHaveBeenCalledWith('v4');
    expect(svc.state().kind).toBe('idle');
  });
});

describe('VideoUploadService — branch coverage (mutation hardening)', () => {
  let svc: VideoUploadService;
  let api: ReturnType<typeof makeVideoSvc>;
  let xhrs: FakeXhr[];
  const CTX = { courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never };
  const CHUNK = 8 * 1024 * 1024;

  beforeEach(() => {
    xhrs = [];
    api = makeVideoSvc();
    TestBed.configureTestingModule({
      providers: [
        VideoUploadService,
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

  afterEach(() => vi.clearAllMocks());

  const sized = (bytes: number, type = 'video/mp4'): File => {
    const f = new File([new Uint8Array(1)], 'f.mp4', { type });
    Object.defineProperty(f, 'size', { value: bytes });
    return f;
  };
  const drain = async (n = 6): Promise<void> => {
    for (let i = 0; i < n; i++) await Promise.resolve();
  };

  // ---- selectFile boundary + return contract ----
  it('accepts a file exactly at the 10 GB limit (boundary)', () => {
    expect(svc.selectFile(sized(10_000_000_000))).toEqual({ ok: true, contentType: 'video/mp4' });
    expect(svc.state()).toEqual({ kind: 'idle' });
  });

  it('selectFile returns { ok: false } for an oversized file', () => {
    expect(svc.selectFile(sized(10_000_000_001))).toEqual({ ok: false });
  });

  it('selectFile returns { ok: false } for an unsupported type', () => {
    expect(svc.selectFile(sized(10, 'text/plain'))).toEqual({ ok: false });
  });

  it('start() does not create a session when the file is invalid', async () => {
    await svc.start(CTX, sized(10, 'text/plain'));
    expect(api.createUploadSession).not.toHaveBeenCalled();
    expect(svc.state().kind).toBe('failed');
  });

  it('createUploadSession is called with the declared size and content type', async () => {
    api.createUploadSession.mockReturnValue(of({ videoId: 'v1' as never, uploadSessionUri: 'u', expiresAt: 'e' }));
    api.completeUpload.mockReturnValue(of({ id: 'v1', state: 'UPLOADED' }));
    const done = svc.start(CTX, sized(8));
    await drain();
    xhrs.at(-1)!.status = 200;
    xhrs.at(-1)!.onload!();
    await done;
    expect(api.createUploadSession).toHaveBeenCalledWith('c1', 'm1', 'l1', {
      sizeBytes: 8,
      contentType: 'video/mp4',
    });
  });

  // ---- hard-failure path ----
  it('a non-retriable status hard-fails: no finalize, marks failed with the status in the reason', async () => {
    api.createUploadSession.mockReturnValue(of({ videoId: 'v1' as never, uploadSessionUri: 'u', expiresAt: 'e' }));
    api.markFailed.mockReturnValue(of({ id: 'v1', state: 'FAILED' }));
    api.completeUpload.mockReturnValue(of({ id: 'v1', state: 'UPLOADED' }));
    const done = svc.start(CTX, sized(8));
    await drain();
    xhrs.at(-1)!.status = 403;
    xhrs.at(-1)!.onload!();
    await done;
    expect(api.completeUpload).not.toHaveBeenCalled();
    expect(api.markFailed).toHaveBeenCalledWith('v1', expect.stringContaining('403'));
    expect(svc.state()).toEqual({ kind: 'failed', reason: expect.stringContaining('403'), videoId: 'v1' });
  });

  it('a 499 status is a hard failure with no retry (status >= 500 boundary)', async () => {
    api.createUploadSession.mockReturnValue(of({ videoId: 'v1' as never, uploadSessionUri: 'u', expiresAt: 'e' }));
    api.markFailed.mockReturnValue(of({ id: 'v1', state: 'FAILED' }));
    const done = svc.start(CTX, sized(8));
    await drain();
    xhrs.at(-1)!.status = 499;
    xhrs.at(-1)!.onload!();
    await done;
    expect(xhrs.length).toBe(1); // no retry → exactly one attempt/XHR
    expect(svc.state().kind).toBe('failed');
  });

  it('treats an XHR network error (onerror) as a hard upload failure', async () => {
    api.createUploadSession.mockReturnValue(of({ videoId: 'v1' as never, uploadSessionUri: 'u', expiresAt: 'e' }));
    api.markFailed.mockReturnValue(of({ id: 'v1', state: 'FAILED' }));
    api.completeUpload.mockReturnValue(of({ id: 'v1', state: 'UPLOADED' }));
    const done = svc.start(CTX, sized(8));
    await drain();
    xhrs.at(-1)!.status = 0;
    xhrs.at(-1)!.onerror!();
    await done;
    expect(api.completeUpload).not.toHaveBeenCalled();
    expect(svc.state().kind).toBe('failed');
  });

  // ---- chunk slicing + percent + XHR wiring ----
  it('slices per chunk and reports percent after each chunk', async () => {
    api.createUploadSession.mockReturnValue(of({ videoId: 'v1' as never, uploadSessionUri: 'https://s', expiresAt: 'e' }));
    api.completeUpload.mockReturnValue(of({ id: 'v1', state: 'UPLOADED' }));
    const file = sized(2 * CHUNK);
    const sliceSpy = vi.spyOn(file, 'slice');
    const done = svc.start(CTX, file);
    await drain();
    xhrs[0].status = 200;
    xhrs[0].onload!();
    await drain();
    // two equal chunks → after the first, percent is exactly 50
    expect(svc.state()).toEqual(expect.objectContaining({ kind: 'uploading', percent: 50 }));
    expect(xhrs[0].open).toHaveBeenCalledWith('PUT', 'https://s', true);
    xhrs[1].status = 200;
    xhrs[1].onload!();
    await done;
    expect(sliceSpy).toHaveBeenNthCalledWith(1, 0, CHUNK);
    expect(sliceSpy).toHaveBeenNthCalledWith(2, CHUNK, 2 * CHUNK);
    expect(svc.state()).toEqual(expect.objectContaining({ kind: 'complete', videoId: 'v1' }));
  });

  // ---- cancel / retry edge states ----
  it('cancel() from a failed state deletes the failed video', async () => {
    api.createUploadSession.mockReturnValue(of({ videoId: 'v1' as never, uploadSessionUri: 'u', expiresAt: 'e' }));
    api.markFailed.mockReturnValue(of({ id: 'v1', state: 'FAILED' }));
    api.delete.mockReturnValue(of(undefined));
    const done = svc.start(CTX, sized(8));
    await drain();
    xhrs.at(-1)!.status = 403;
    xhrs.at(-1)!.onload!();
    await done;
    expect(svc.state().kind).toBe('failed');
    await svc.cancel();
    expect(api.delete).toHaveBeenCalledWith('v1');
    expect(svc.state().kind).toBe('idle');
  });

  it('cancel() from a complete state does NOT delete the video', async () => {
    api.createUploadSession.mockReturnValue(of({ videoId: 'v1' as never, uploadSessionUri: 'u', expiresAt: 'e' }));
    api.completeUpload.mockReturnValue(of({ id: 'v1', state: 'UPLOADED' }));
    const done = svc.start(CTX, sized(8));
    await drain();
    xhrs.at(-1)!.status = 200;
    xhrs.at(-1)!.onload!();
    await done;
    expect(svc.state().kind).toBe('complete');
    await svc.cancel();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('retry() is a no-op when the failed state carries no videoId', async () => {
    svc.selectFile(sized(10, 'text/plain')); // failed WITHOUT a videoId
    expect(svc.state().kind).toBe('failed');
    await svc.retry();
    expect(api.delete).not.toHaveBeenCalled();
    expect(svc.state().kind).toBe('failed'); // unchanged — guard returned early
  });

  it('cancel() from a failed state with no videoId does not call delete', async () => {
    svc.selectFile(sized(10, 'text/plain')); // failed WITHOUT a videoId
    expect(svc.state().kind).toBe('failed');
    await svc.cancel();
    expect(api.delete).not.toHaveBeenCalled(); // the `if (vid)` guard skips delete
    expect(svc.state().kind).toBe('idle');
  });

  it('retries on a 500 status (status >= 500 boundary) and can then succeed', async () => {
    vi.useFakeTimers();
    try {
      api.createUploadSession.mockReturnValue(of({ videoId: 'v1' as never, uploadSessionUri: 'u', expiresAt: 'e' }));
      api.completeUpload.mockReturnValue(of({ id: 'v1', state: 'UPLOADED' }));
      const done = svc.start(CTX, sized(8));
      await Promise.resolve();
      xhrs.at(-1)!.status = 500; // exactly at the >= 500 retry boundary
      xhrs.at(-1)!.onload!();
      await vi.runAllTimersAsync();
      await Promise.resolve();
      expect(xhrs.length).toBeGreaterThanOrEqual(2); // retried → a fresh attempt
      xhrs.at(-1)!.status = 200;
      xhrs.at(-1)!.onload!();
      await vi.runAllTimersAsync();
      await done;
      expect(svc.state().kind).toBe('complete');
    } finally {
      vi.useRealTimers();
    }
  });
});

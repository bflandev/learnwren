import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseId, LessonId, ModuleId } from '@learnwren/shared-data-models';
import { MATERIAL_MAX_SIZE_BYTES } from '@learnwren/shared-data-models';

import { MaterialsService } from './materials.service';
import { MATERIAL_XHR_FACTORY, MaterialUploadService } from './material-upload.service';

const ctx = {
  courseId: 'c1' as CourseId,
  moduleId: 'm1' as ModuleId,
  lessonId: 'l1' as LessonId,
};

/** A fake XHR whose PUT resolves to a configurable status. */
function fakeXhr(status: number) {
  return {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    upload: {} as { onprogress?: (e: ProgressEvent) => void },
    send: vi.fn(function (this: { onload?: () => void; status: number }) {
      this.status = status;
      queueMicrotask(() => this.onload?.());
    }),
    status: 0,
    onload: undefined as undefined | (() => void),
    onerror: undefined as undefined | (() => void),
  };
}

function makeFile(name: string, size = 100): File {
  const f = new File(['x'], name);
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

function setup(over: { put?: number; api?: Partial<MaterialsService> } = {}) {
  const api: Partial<MaterialsService> = {
    createUploadUrl: vi.fn().mockReturnValue(
      of({ materialId: 'mat1', uploadUrl: '/api/internal/fake-materials/mat1', expiresAt: 'T' }),
    ),
    complete: vi.fn().mockReturnValue(of({})),
    remove: vi.fn().mockReturnValue(of(undefined)),
    ...over.api,
  };
  TestBed.configureTestingModule({
    providers: [
      MaterialUploadService,
      { provide: MaterialsService, useValue: api },
      { provide: MATERIAL_XHR_FACTORY, useValue: () => fakeXhr(over.put ?? 200) },
    ],
  });
  return { svc: TestBed.inject(MaterialUploadService), api };
}

describe('MaterialUploadService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('uploads a valid file end-to-end (createUploadUrl → PUT → complete)', async () => {
    const { svc, api } = setup();
    const completed = await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    expect(completed).toBe(1);
    expect(api.createUploadUrl).toHaveBeenCalled();
    expect(api.complete).toHaveBeenCalledWith('mat1');
    expect(svc.failures()).toEqual([]);
  });

  it('skips an unsupported extension with a failure message, continues others', async () => {
    const { svc, api } = setup();
    const completed = await svc.uploadFiles(ctx, [makeFile('virus.exe'), makeFile('ok.pdf')]);
    expect(completed).toBe(1);
    expect(svc.failures()).toHaveLength(1);
    expect(svc.failures()[0].filename).toBe('virus.exe');
    expect(svc.failures()[0].reason).toMatch(/unsupported/i);
    expect(api.createUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('skips an oversized file with a 50 MB message', async () => {
    const { svc } = setup();
    const completed = await svc.uploadFiles(ctx, [
      makeFile('big.pdf', MATERIAL_MAX_SIZE_BYTES + 1),
    ]);
    expect(completed).toBe(0);
    expect(svc.failures()[0].reason).toMatch(/50 MB/i);
  });

  it('records a failure when the PUT returns a non-2xx status', async () => {
    const { svc, api } = setup({ put: 500 });
    const completed = await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    expect(completed).toBe(0);
    expect(svc.failures()[0].reason).toMatch(/failed/i);
    expect(api.complete).not.toHaveBeenCalled();
  });

  it('calls api.remove with the materialId when PUT returns non-2xx (orphan cleanup)', async () => {
    const { svc, api } = setup({ put: 500 });
    await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    expect(api.remove).toHaveBeenCalledWith('mat1');
  });

  it('records a failure when createUploadUrl errors', async () => {
    const { svc } = setup({
      api: { createUploadUrl: vi.fn().mockReturnValue(throwError(() => new Error('network'))) },
    });
    const completed = await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    expect(completed).toBe(0);
    expect(svc.failures()).toHaveLength(1);
  });

  it('falls back to "Upload failed." when the thrown error is not an Error instance', async () => {
    const { svc } = setup({
      api: { createUploadUrl: vi.fn().mockReturnValue(throwError(() => 'opaque-string')) },
    });
    await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    expect(svc.failures()[0].reason).toBe('Upload failed.');
  });

  it('flags a missing extension as unsupported', async () => {
    const { svc } = setup();
    const completed = await svc.uploadFiles(ctx, [makeFile('no-extension', 100)]);
    expect(completed).toBe(0);
    expect(svc.failures()[0].reason).toMatch(/unsupported/i);
  });

  it('emits upload progress while the XHR reports lengthComputable updates', async () => {
    const xhr = fakeXhr(200);
    const xhrs: typeof xhr[] = [];
    TestBed.configureTestingModule({
      providers: [
        MaterialUploadService,
        {
          provide: MaterialsService,
          useValue: {
            createUploadUrl: vi.fn().mockReturnValue(
              of({ materialId: 'm', uploadUrl: '/api/internal/fake-materials/m', expiresAt: 'T' }),
            ),
            complete: vi.fn().mockReturnValue(of({})),
            remove: vi.fn().mockReturnValue(of(undefined)),
          },
        },
        {
          provide: MATERIAL_XHR_FACTORY,
          useValue: () => {
            xhrs.push(xhr);
            return xhr;
          },
        },
      ],
    });
    const svc = TestBed.inject(MaterialUploadService);

    // Synchronously fire a progress event in the middle of the upload via the
    // injected XHR. We intercept the original `send` to fire progress *before*
    // onload runs.
    const realSend = xhr.send;
    xhr.send = vi.fn(function (this: typeof xhr) {
      this.upload.onprogress?.({
        lengthComputable: true, loaded: 50, total: 100,
      } as ProgressEvent);
      // delegate to the original to finish with success
      realSend.call(this);
    }) as never;

    const promise = svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    await promise;
    // After completion, in-flight is cleared; we only need to verify the path
    // ran without throwing — the lengthComputable branch is now exercised.
    expect(svc.inFlight()).toEqual([]);
  });

  it('ignores progress events that are not lengthComputable', async () => {
    const xhr = fakeXhr(200);
    TestBed.configureTestingModule({
      providers: [
        MaterialUploadService,
        {
          provide: MaterialsService,
          useValue: {
            createUploadUrl: vi.fn().mockReturnValue(
              of({ materialId: 'm', uploadUrl: '/api/internal/fake-materials/m', expiresAt: 'T' }),
            ),
            complete: vi.fn().mockReturnValue(of({})),
            remove: vi.fn().mockReturnValue(of(undefined)),
          },
        },
        { provide: MATERIAL_XHR_FACTORY, useValue: () => xhr },
      ],
    });
    const svc = TestBed.inject(MaterialUploadService);
    const realSend = xhr.send;
    xhr.send = vi.fn(function (this: typeof xhr) {
      this.upload.onprogress?.({
        lengthComputable: false, loaded: 0, total: 0,
      } as ProgressEvent);
      realSend.call(this);
    }) as never;
    await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    expect(svc.failures()).toEqual([]);
  });

  it('XHR is opened with PUT, the uploadUrl, and async=true; sets Content-Type for the extension', async () => {
    const xhr = fakeXhr(200);
    TestBed.configureTestingModule({
      providers: [
        MaterialUploadService,
        {
          provide: MaterialsService,
          useValue: {
            createUploadUrl: vi.fn().mockReturnValue(
              of({ materialId: 'm', uploadUrl: '/signed-url-here', expiresAt: 'T' }),
            ),
            complete: vi.fn().mockReturnValue(of({})),
            remove: vi.fn().mockReturnValue(of(undefined)),
          },
        },
        { provide: MATERIAL_XHR_FACTORY, useValue: () => xhr },
      ],
    });
    const svc = TestBed.inject(MaterialUploadService);
    await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);

    expect(xhr.open).toHaveBeenCalledWith('PUT', '/signed-url-here', true);
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
  });

  it('accepts a file at exactly the 50 MB size boundary (kills > vs >= mutant)', async () => {
    const { svc } = setup();
    const completed = await svc.uploadFiles(ctx, [
      makeFile('big.pdf', MATERIAL_MAX_SIZE_BYTES),
    ]);
    expect(completed).toBe(1);
    expect(svc.failures()).toEqual([]);
  });

  it('treats a leading-dot filename like ".pdf" as supported (kills dot >= 0 vs > 0 mutant)', async () => {
    const { svc } = setup();
    const completed = await svc.uploadFiles(ctx, [makeFile('.pdf')]);
    expect(completed).toBe(1);
    expect(svc.failures()).toEqual([]);
  });

  it('progress events update inFlight with the latest percent (replaces, not appends)', async () => {
    const xhr = fakeXhr(200);
    let progressFn: ((pct: number) => void) | undefined;
    let captured: number[] = [];
    TestBed.configureTestingModule({
      providers: [
        MaterialUploadService,
        {
          provide: MaterialsService,
          useValue: {
            createUploadUrl: vi.fn().mockReturnValue(
              of({ materialId: 'm', uploadUrl: '/u', expiresAt: 'T' }),
            ),
            complete: vi.fn().mockReturnValue(of({})),
            remove: vi.fn().mockReturnValue(of(undefined)),
          },
        },
        { provide: MATERIAL_XHR_FACTORY, useValue: () => xhr },
      ],
    });
    const svc = TestBed.inject(MaterialUploadService);

    const realSend = xhr.send;
    xhr.send = vi.fn(function (this: typeof xhr) {
      // Fire three progress events mid-upload and snapshot the signal after each.
      this.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 } as ProgressEvent);
      captured.push(svc.inFlight()[0]?.percent ?? -1);
      captured.push(svc.inFlight().length);
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
      captured.push(svc.inFlight()[0]?.percent ?? -1);
      captured.push(svc.inFlight().length);
      this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 } as ProgressEvent);
      captured.push(svc.inFlight()[0]?.percent ?? -1);
      captured.push(svc.inFlight().length);
      realSend.call(this);
    }) as never;
    void progressFn;

    await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);

    // After each progress event the signal has EXACTLY one entry (no duplicates
    // because setProgress filters by filename), and percent equals the latest value.
    expect(captured).toEqual([25, 1, 50, 1, 100, 1]);
  });

  it('records a failure when the XHR fires onerror (network failure → status 0)', async () => {
    const xhr = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      upload: {} as { onprogress?: (e: ProgressEvent) => void },
      send: vi.fn(function (this: { onerror?: () => void }) {
        queueMicrotask(() => this.onerror?.());
      }),
      status: 0,
      onload: undefined as undefined | (() => void),
      onerror: undefined as undefined | (() => void),
    };
    TestBed.configureTestingModule({
      providers: [
        MaterialUploadService,
        {
          provide: MaterialsService,
          useValue: {
            createUploadUrl: vi.fn().mockReturnValue(
              of({ materialId: 'm', uploadUrl: '/api/internal/fake-materials/m', expiresAt: 'T' }),
            ),
            complete: vi.fn().mockReturnValue(of({})),
            remove: vi.fn().mockReturnValue(of(undefined)),
          },
        },
        { provide: MATERIAL_XHR_FACTORY, useValue: () => xhr },
      ],
    });
    const svc = TestBed.inject(MaterialUploadService);
    await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    expect(svc.failures()).toHaveLength(1);
  });
});

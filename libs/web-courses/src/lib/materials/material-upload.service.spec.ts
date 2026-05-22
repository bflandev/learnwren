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
});

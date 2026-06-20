import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseId } from '@learnwren/shared-data-models';

import { CourseCoverUploaderComponent } from './course-cover-uploader.component';
import { CourseCoverService } from './course-cover.service';

const CID = 'c1' as CourseId;

function makeFile(type = 'image/jpeg', size = 1024): File {
  return new File([new Uint8Array(size)], 'cover.jpg', { type });
}

describe('CourseCoverUploaderComponent', () => {
  let svc: {
    upload: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    validateLocally: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    svc = {
      upload: vi.fn(),
      remove: vi.fn(),
      validateLocally: vi.fn().mockReturnValue({ ok: true }),
    };
    TestBed.configureTestingModule({
      imports: [CourseCoverUploaderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CourseCoverService, useValue: svc },
      ],
    });
  });

  it('starts in idle and emits coverChanged with the new URL on successful upload', async () => {
    svc.upload.mockResolvedValue({
      coverImageUrl: 'https://cdn/c1.jpg?v=1',
      updatedAt: '2026-05-25T12:00:00.000Z',
    });
    const fixture = TestBed.createComponent(CourseCoverUploaderComponent);
    fixture.componentRef.setInput('courseId', CID);
    fixture.detectChanges();
    const emissions: Array<{ coverImageUrl: string | undefined; updatedAt: string }> = [];
    fixture.componentInstance.coverChanged.subscribe((e) => emissions.push(e));

    await fixture.componentInstance.onFileSelected(makeFile());
    expect(svc.upload).toHaveBeenCalledWith(CID, expect.any(File));
    expect(emissions).toEqual([
      { coverImageUrl: 'https://cdn/c1.jpg?v=1', updatedAt: '2026-05-25T12:00:00.000Z' },
    ]);
    expect(fixture.componentInstance.state()).toEqual({ kind: 'idle' });
  });

  it('moves to failed and surfaces the local validation reason without calling upload', async () => {
    svc.validateLocally.mockReturnValue({ ok: false, reason: 'Cover image must be JPEG or PNG.' });
    const fixture = TestBed.createComponent(CourseCoverUploaderComponent);
    fixture.componentRef.setInput('courseId', CID);
    fixture.detectChanges();

    await fixture.componentInstance.onFileSelected(makeFile('image/gif'));
    expect(svc.upload).not.toHaveBeenCalled();
    const s = fixture.componentInstance.state();
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') expect(s.reason).toBe('Cover image must be JPEG or PNG.');
  });

  it('moves to failed on HTTP error and exposes the API error code/message', async () => {
    svc.upload.mockRejectedValue({
      error: { error: { code: 'COVER_DIMENSIONS_TOO_SMALL', message: 'too small' } },
    });
    const fixture = TestBed.createComponent(CourseCoverUploaderComponent);
    fixture.componentRef.setInput('courseId', CID);
    fixture.detectChanges();

    await fixture.componentInstance.onFileSelected(makeFile());
    const s = fixture.componentInstance.state();
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') expect(s.reason).toContain('too small');
  });

  it('emits coverChanged with undefined URL on remove', async () => {
    svc.remove.mockResolvedValue(undefined);
    const fixture = TestBed.createComponent(CourseCoverUploaderComponent);
    fixture.componentRef.setInput('courseId', CID);
    fixture.componentRef.setInput('currentCoverUrl', 'https://cdn/c1.jpg?v=1');
    fixture.detectChanges();
    const emissions: Array<{ coverImageUrl: string | undefined; updatedAt: string }> = [];
    fixture.componentInstance.coverChanged.subscribe((e) => emissions.push(e));

    await fixture.componentInstance.onRemove();
    expect(svc.remove).toHaveBeenCalledWith(CID);
    expect(emissions[0].coverImageUrl).toBeUndefined();
    expect(typeof emissions[0].updatedAt).toBe('string');
    expect(emissions[0].updatedAt.length).toBeGreaterThan(0);
  });

  function build() {
    const fixture = TestBed.createComponent(CourseCoverUploaderComponent);
    fixture.componentRef.setInput('courseId', CID);
    fixture.detectChanges();
    return fixture;
  }

  it('starts in the idle state and failedState() is null while idle', () => {
    const fixture = build();
    expect(fixture.componentInstance.state()).toEqual({ kind: 'idle' });
    expect(fixture.componentInstance.failedState()).toBeNull();
  });

  it('failedState() returns the failed state object only when state is failed', async () => {
    svc.validateLocally.mockReturnValue({ ok: false, reason: 'nope' });
    const fixture = build();
    await fixture.componentInstance.onFileSelected(makeFile('image/gif'));
    expect(fixture.componentInstance.failedState()).toEqual({ kind: 'failed', reason: 'nope' });
  });

  it('is in the uploading state while an upload is in flight', async () => {
    let resolve!: (v: { coverImageUrl: string; updatedAt: string }) => void;
    svc.upload.mockReturnValue(new Promise((r) => { resolve = r; }));
    const fixture = build();
    const p = fixture.componentInstance.onFileSelected(makeFile());
    expect(fixture.componentInstance.state()).toEqual({ kind: 'uploading' });
    resolve({ coverImageUrl: 'u', updatedAt: '2026-05-25T12:00:00.000Z' });
    await p;
    expect(fixture.componentInstance.state()).toEqual({ kind: 'idle' });
  });

  it('is in the uploading state while a remove is in flight, then idle', async () => {
    let resolve!: () => void;
    svc.remove.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    const fixture = build();
    const p = fixture.componentInstance.onRemove();
    expect(fixture.componentInstance.state()).toEqual({ kind: 'uploading' });
    resolve();
    await p;
    expect(fixture.componentInstance.state()).toEqual({ kind: 'idle' });
  });

  it('moves to failed with the API message when remove rejects', async () => {
    svc.remove.mockRejectedValue({ error: { error: { message: 'remove blew up' } } });
    const fixture = build();
    await fixture.componentInstance.onRemove();
    expect(fixture.componentInstance.state()).toEqual({ kind: 'failed', reason: 'remove blew up' });
  });

  it('falls back to the default reason when the error has no nested message', async () => {
    svc.upload.mockRejectedValue({}); // no .error.error.message
    const fixture = build();
    await fixture.componentInstance.onFileSelected(makeFile());
    expect(fixture.componentInstance.state()).toEqual({
      kind: 'failed',
      reason: 'Cover image upload failed.',
    });
  });

  it('falls back to the default reason when err.error exists but err.error.error is missing', async () => {
    // exercises the middle optional-chain: (err).error?.error
    svc.upload.mockRejectedValue({ error: {} });
    const fixture = build();
    await fixture.componentInstance.onFileSelected(makeFile());
    expect(fixture.componentInstance.state()).toEqual({
      kind: 'failed',
      reason: 'Cover image upload failed.',
    });
  });

  it('falls back to the default reason when err.error.error has no message field', async () => {
    // exercises body?.message when body exists without a message
    svc.upload.mockRejectedValue({ error: { error: { code: 'X' } } });
    const fixture = build();
    await fixture.componentInstance.onFileSelected(makeFile());
    expect(fixture.componentInstance.state()).toEqual({
      kind: 'failed',
      reason: 'Cover image upload failed.',
    });
  });

  it('falls back to the default reason when the error itself is null/undefined', async () => {
    svc.upload.mockRejectedValue(null); // (err)?.error?.error must not throw
    const fixture = build();
    await fixture.componentInstance.onFileSelected(makeFile());
    expect(fixture.componentInstance.state()).toEqual({
      kind: 'failed',
      reason: 'Cover image upload failed.',
    });
  });

  it('onRetry resets a failed state back to idle', async () => {
    svc.validateLocally.mockReturnValue({ ok: false, reason: 'nope' });
    const fixture = build();
    await fixture.componentInstance.onFileSelected(makeFile('image/gif'));
    expect(fixture.componentInstance.state().kind).toBe('failed');
    fixture.componentInstance.onRetry();
    expect(fixture.componentInstance.state()).toEqual({ kind: 'idle' });
  });

  it('onFileInput uploads the first chosen file and resets the input value', async () => {
    svc.upload.mockResolvedValue({ coverImageUrl: 'u', updatedAt: '2026-05-25T12:00:00.000Z' });
    const fixture = build();
    const file = makeFile();
    const inputEl = { files: [file] as unknown as FileList, value: 'cover.jpg' };
    fixture.componentInstance.onFileInput({ target: inputEl } as unknown as Event);
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.upload).toHaveBeenCalledTimes(1);
    expect(inputEl.value).toBe('');
  });

  it('onFileInput does not upload when no file is picked, but still clears the value', () => {
    const fixture = build();
    const inputEl = { files: [] as unknown as FileList, value: 'stale' };
    fixture.componentInstance.onFileInput({ target: inputEl } as unknown as Event);
    expect(svc.upload).not.toHaveBeenCalled();
    expect(inputEl.value).toBe('');
  });

  it('onFileInput handles a null FileList gracefully (no upload, value cleared)', () => {
    const fixture = build();
    const inputEl = { files: null, value: 'stale' };
    fixture.componentInstance.onFileInput({ target: inputEl } as unknown as Event);
    expect(svc.upload).not.toHaveBeenCalled();
    expect(inputEl.value).toBe('');
  });
});

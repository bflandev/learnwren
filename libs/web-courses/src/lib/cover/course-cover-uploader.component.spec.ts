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
  });
});

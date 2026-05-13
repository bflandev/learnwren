import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { VideoUploadComponent } from './video-upload.component';
import { VideoUploadService, type UploadState } from './video-upload.service';

function buildFakeSvc(initial: UploadState = { kind: 'idle' }) {
  const state = signal<UploadState>(initial);
  return {
    state: state.asReadonly(),
    _state: state,
    start: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    selectFile: vi.fn().mockReturnValue({ ok: true, contentType: 'video/mp4' }),
  };
}

describe('VideoUploadComponent', () => {
  function build(svcOverride?: ReturnType<typeof buildFakeSvc>) {
    const svc = svcOverride ?? buildFakeSvc();
    TestBed.configureTestingModule({
      imports: [VideoUploadComponent],
    });
    TestBed.overrideProvider(VideoUploadService, { useValue: svc });
    const fixture = TestBed.createComponent(VideoUploadComponent);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('moduleId', 'm1');
    fixture.componentRef.setInput('lessonId', 'l1');
    fixture.detectChanges();
    return { fixture, svc };
  }

  it('renders the upload zone in idle state', () => {
    const { fixture } = build();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[type="file"]')).toBeTruthy();
  });

  it('shows progress indicator while uploading', () => {
    const svc = buildFakeSvc({ kind: 'uploading', percent: 42, videoId: 'v1' as never });
    const { fixture } = build(svc);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('progress')).toBeTruthy();
    expect(el.textContent).toContain('42');
  });

  it('shows error message in failed state', () => {
    const svc = buildFakeSvc({ kind: 'failed', reason: 'Unsupported format.' });
    const { fixture } = build(svc);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Unsupported format.');
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('shows preparing message while creating session', () => {
    const svc = buildFakeSvc({ kind: 'creating-session' });
    const { fixture } = build(svc);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Preparing');
  });

  it('emits uploaded event when svc completes after onFile', async () => {
    const svc = buildFakeSvc();
    const { fixture } = build(svc);
    const spy = vi.spyOn(fixture.componentInstance.uploaded, 'emit');

    // After svc.start resolves, set complete state
    svc.start.mockImplementation(async () => {
      svc._state.set({ kind: 'complete', videoId: 'v-new' as never });
    });

    const file = new File(['x'], 'test.mp4', { type: 'video/mp4' });
    await fixture.componentInstance.onFile(file);
    expect(spy).toHaveBeenCalledWith('v-new');
  });

  it('calls svc.cancel on cancel button click', () => {
    const svc = buildFakeSvc({ kind: 'uploading', percent: 50, videoId: 'v1' as never });
    const { fixture } = build(svc);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[type="button"]')!
      .click();
    expect(svc.cancel).toHaveBeenCalled();
  });
});

import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { VideoCaptionsMeta, VideoId } from '@learnwren/shared-data-models';

import { CaptionsPanelComponent } from './captions-panel.component';
import { CaptionsService } from './captions.service';

describe('CaptionsPanelComponent', () => {
  let fixture: ComponentFixture<CaptionsPanelComponent>;
  let svc: { getMeta: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; validateLocally: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    svc = {
      getMeta: vi.fn().mockResolvedValue(null),
      upload: vi.fn().mockResolvedValue({ language: 'en', label: 'English', updatedAt: 'now' }),
      remove: vi.fn().mockResolvedValue(undefined),
      validateLocally: vi.fn().mockReturnValue({ ok: true }),
    };
    await TestBed.configureTestingModule({
      imports: [CaptionsPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CaptionsService, useValue: svc }],
    }).compileComponents();
    fixture = TestBed.createComponent(CaptionsPanelComponent);
    fixture.componentRef.setInput('videoId', 'v1' as VideoId);
  });

  it('shows the "add captions" affordance when none exist', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="captions-add"]')).not.toBeNull();
  });

  it('shows present state after a successful upload', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.onFileChosen(new File(['WEBVTT'], 'c.vtt', { type: 'text/vtt' }));
    fixture.detectChanges();
    expect(svc.upload).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="captions-present"]')).not.toBeNull();
  });

  it('surfaces a local validation error without calling the API', async () => {
    svc.validateLocally.mockReturnValue({ ok: false, reason: 'bad' });
    fixture.detectChanges();
    await fixture.componentInstance.onFileChosen(new File(['x'], 'a.txt', { type: 'text/plain' }));
    fixture.detectChanges();
    expect(svc.upload).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="captions-error"]')).not.toBeNull();
  });

  it('emits metaChange with null after init when no captions exist', async () => {
    const emitted: Array<VideoCaptionsMeta | null> = [];
    fixture.componentInstance.metaChange.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(emitted).toEqual([null]);
  });

  it('emits metaChange with the loaded meta after init when captions exist', async () => {
    const loaded: VideoCaptionsMeta = { language: 'en', label: 'English', updatedAt: 'now' };
    svc.getMeta.mockResolvedValue(loaded);
    const emitted: Array<VideoCaptionsMeta | null> = [];
    fixture.componentInstance.metaChange.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(emitted).toEqual([loaded]);
  });

  it('emits metaChange after a successful upload', async () => {
    const uploaded: VideoCaptionsMeta = { language: 'en', label: 'English', updatedAt: 'now' };
    svc.upload.mockResolvedValue(uploaded);
    const emitted: Array<VideoCaptionsMeta | null> = [];
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.metaChange.subscribe((v) => emitted.push(v));
    await fixture.componentInstance.onFileChosen(new File(['WEBVTT'], 'c.vtt', { type: 'text/vtt' }));
    expect(emitted).toEqual([uploaded]);
  });

  it('emits metaChange with null after a successful remove', async () => {
    const loaded: VideoCaptionsMeta = { language: 'en', label: 'English', updatedAt: 'now' };
    svc.getMeta.mockResolvedValue(loaded);
    const emitted: Array<VideoCaptionsMeta | null> = [];
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.metaChange.subscribe((v) => emitted.push(v));
    await fixture.componentInstance.onRemove();
    expect(emitted).toEqual([null]);
  });

  it('starts not busy with no error', () => {
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('emits metaChange(null) when ngOnInit getMeta rejects (non-fatal)', async () => {
    svc.getMeta.mockRejectedValue(new Error('network'));
    const emitted: Array<VideoCaptionsMeta | null> = [];
    fixture.componentInstance.metaChange.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(emitted).toEqual([null]);
    expect(fixture.componentInstance.meta()).toBeNull();
  });

  it('sets busy true during an upload and clears it in the finally block', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    let resolve!: (m: VideoCaptionsMeta) => void;
    svc.upload.mockReturnValue(new Promise<VideoCaptionsMeta>((r) => { resolve = r; }));
    const p = fixture.componentInstance.onFileChosen(new File(['WEBVTT'], 'c.vtt', { type: 'text/vtt' }));
    expect(fixture.componentInstance.busy()).toBe(true);
    resolve({ language: 'en', label: 'English', updatedAt: 'now' });
    await p;
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('shows the exact upload-failure message and clears busy on upload error', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    svc.upload.mockRejectedValue(new Error('boom'));
    await fixture.componentInstance.onFileChosen(new File(['WEBVTT'], 'c.vtt', { type: 'text/vtt' }));
    expect(fixture.componentInstance.error()).toBe('Upload failed. Try again.');
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('sets busy true during a remove and clears it in the finally block', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    let resolve!: () => void;
    svc.remove.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    const p = fixture.componentInstance.onRemove();
    expect(fixture.componentInstance.busy()).toBe(true);
    resolve();
    await p;
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('shows the exact remove-failure message and clears busy on remove error', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    svc.remove.mockRejectedValue(new Error('boom'));
    await fixture.componentInstance.onRemove();
    expect(fixture.componentInstance.error()).toBe('Remove failed. Try again.');
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('onInputChange uploads the chosen file and resets the input value', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const file = new File(['WEBVTT'], 'c.vtt', { type: 'text/vtt' });
    const input = { files: [file] as unknown as FileList, value: 'c.vtt' };
    fixture.componentInstance.onInputChange({ target: input } as unknown as Event);
    await fixture.whenStable();
    expect(svc.upload).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  it('onInputChange does nothing (no upload) when no file is selected, but still resets the value', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    svc.upload.mockClear();
    const input = { files: [] as unknown as FileList, value: '' };
    fixture.componentInstance.onInputChange({ target: input } as unknown as Event);
    await fixture.whenStable();
    expect(svc.upload).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('onInputChange handles a null FileList gracefully (no upload, value reset)', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    svc.upload.mockClear();
    const input = { files: null, value: 'stale' };
    fixture.componentInstance.onInputChange({ target: input } as unknown as Event);
    await fixture.whenStable();
    expect(svc.upload).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });
});

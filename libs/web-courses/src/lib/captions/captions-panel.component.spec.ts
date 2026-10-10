import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { VideoCaptionsMeta, VideoId } from '@learnwren/shared-data-models';

import { captionLanguageOptions } from './caption-languages';
import { CaptionsPanelComponent } from './captions-panel.component';
import { CaptionsService } from './captions.service';

const EN: VideoCaptionsMeta = { language: 'en', label: 'English', updatedAt: 'now' };
const FR: VideoCaptionsMeta = { language: 'fr', label: 'French', updatedAt: 'now' };
const VTT = () => new File(['WEBVTT'], 'c.vtt', { type: 'text/vtt' });

describe('captionLanguageOptions', () => {
  const options = captionLanguageOptions();

  it('resolves all 27 codes, sorted by label', () => {
    expect(options).toHaveLength(27);
    const labels = options.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(options).toContainEqual({ language: 'en', label: 'English' });
    expect(options).toContainEqual({ language: 'zh-Hant', label: 'Traditional Chinese' });
  });

  it('every option is a resolved, distinct language', () => {
    expect(options.every((o) => o.language !== '' && o.label !== '')).toBe(true);
    expect(new Set(options.map((o) => o.language)).size).toBe(options.length);
  });
});

describe('CaptionsPanelComponent', () => {
  let fixture: ComponentFixture<CaptionsPanelComponent>;
  let svc: { list: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; validateLocally: ReturnType<typeof vi.fn> };
  let emitted: VideoCaptionsMeta[][];

  async function init(tracks: VideoCaptionsMeta[] = []): Promise<void> {
    svc.list.mockResolvedValue(tracks);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  beforeEach(async () => {
    svc = {
      list: vi.fn().mockResolvedValue([]),
      upload: vi.fn().mockResolvedValue(FR),
      remove: vi.fn().mockResolvedValue(undefined),
      validateLocally: vi.fn().mockReturnValue({ ok: true }),
    };
    await TestBed.configureTestingModule({
      imports: [CaptionsPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CaptionsService, useValue: svc }],
    }).compileComponents();
    fixture = TestBed.createComponent(CaptionsPanelComponent);
    fixture.componentRef.setInput('videoId', 'v1' as VideoId);
    emitted = [];
    fixture.componentInstance.tracksChange.subscribe((v) => emitted.push(v));
  });

  it('starts not busy, no error, English selected', () => {
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(fixture.componentInstance.error()).toBeNull();
    expect(fixture.componentInstance.language()).toBe('en');
    expect(fixture.componentInstance.tracks()).toEqual([]);
  });

  it('loads and renders every track, emitting them', async () => {
    await init([EN, FR]);
    expect(svc.list).toHaveBeenCalledWith('v1');
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="captions-track"]');
    expect([...rows].map((r) => (r as HTMLElement).textContent)).toEqual([
      expect.stringContaining('English'),
      expect.stringContaining('French'),
    ]);
    expect(emitted).toEqual([[EN, FR]]);
  });

  it('shows no track rows when none exist, and emits []', async () => {
    await init();
    expect(q('[data-testid="captions-track"]')).toBeNull();
    expect(q('[data-testid="captions-add"]')).not.toBeNull();
    expect(emitted).toEqual([[]]);
  });

  it('says the tracks could not be loaded when the initial list rejects, instead of claiming there are none', async () => {
    svc.list.mockRejectedValue(new Error('network'));
    fixture.detectChanges();
    await fixture.whenStable();
    // Emitting [] would wipe the tracks the preview player already has.
    expect(emitted).toEqual([]);
    expect(fixture.componentInstance.error()).toBe("Couldn't load the caption tracks. Reload the page to try again.");
  });

  it('does not upload over a list it failed to load (it would show only the new track and hide the rest)', async () => {
    svc.list.mockRejectedValue(new Error('network'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.componentInstance.onFileChosen(VTT());
    expect(svc.upload).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain("Couldn't load the caption tracks");
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('uploads the chosen file under the selected language and adds it in label order', async () => {
    await init([EN]);
    fixture.componentInstance.language.set('fr');
    await fixture.componentInstance.onFileChosen(VTT());
    expect(svc.upload).toHaveBeenCalledWith('v1', 'fr', expect.any(File));
    expect(fixture.componentInstance.tracks()).toEqual([EN, FR]);
    expect(emitted.at(-1)).toEqual([EN, FR]);
  });

  it('replaces an existing track of the same language instead of duplicating it', async () => {
    const newer = { ...EN, updatedAt: 'later' };
    await init([EN, FR]);
    svc.upload.mockResolvedValue(newer);
    await fixture.componentInstance.onFileChosen(VTT());
    expect(fixture.componentInstance.tracks()).toEqual([newer, FR]);
  });

  it('surfaces a local validation error without calling the API', async () => {
    await init();
    svc.validateLocally.mockReturnValue({ ok: false, reason: 'bad' });
    await fixture.componentInstance.onFileChosen(new File(['x'], 'a.txt', { type: 'text/plain' }));
    fixture.detectChanges();
    expect(svc.upload).not.toHaveBeenCalled();
    expect(q('[data-testid="captions-error"]')?.textContent).toContain('bad');
  });

  it('shows the exact upload-failure message and clears busy on upload error', async () => {
    await init();
    svc.upload.mockRejectedValue(new Error('boom'));
    await fixture.componentInstance.onFileChosen(VTT());
    expect(fixture.componentInstance.error()).toBe('Upload failed. Try again.');
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('says the file is not valid WebVTT when the API rejects it with INVALID_CAPTION_FILE', async () => {
    await init();
    svc.upload.mockRejectedValue({ error: { error: { code: 'INVALID_CAPTION_FILE' } } });
    await fixture.componentInstance.onFileChosen(VTT());
    expect(fixture.componentInstance.error()).toContain('not a valid WebVTT');
  });

  it('names the track cap when the API rejects a new language with CAPTION_TRACK_LIMIT', async () => {
    await init();
    svc.upload.mockRejectedValue({ error: { error: { code: 'CAPTION_TRACK_LIMIT' } } });
    await fixture.componentInstance.onFileChosen(VTT());
    expect(fixture.componentInstance.error()).toBe(
      'This video already has the maximum of 20 caption languages. Remove one first.',
    );
  });

  it('falls back to the generic message when the error body is not a JSON envelope', async () => {
    await init();
    svc.upload.mockRejectedValue({ error: 'Bad Gateway' });
    await fixture.componentInstance.onFileChosen(VTT());
    expect(fixture.componentInstance.error()).toBe('Upload failed. Try again.');
  });

  it('sets busy during an upload and clears it afterwards', async () => {
    await init();
    let resolve!: (m: VideoCaptionsMeta) => void;
    svc.upload.mockReturnValue(new Promise<VideoCaptionsMeta>((r) => { resolve = r; }));
    const p = fixture.componentInstance.onFileChosen(VTT());
    expect(fixture.componentInstance.busy()).toBe(true);
    resolve(EN);
    await p;
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('removes one language via its row button and emits the remainder', async () => {
    await init([EN, FR]);
    const removeFr = fixture.nativeElement.querySelectorAll('[data-testid="captions-remove"]')[1] as HTMLButtonElement;
    expect(removeFr.getAttribute('aria-label')).toBe('Remove French captions');
    removeFr.click();
    await fixture.whenStable();
    expect(svc.remove).toHaveBeenCalledWith('v1', 'fr');
    expect(fixture.componentInstance.tracks()).toEqual([EN]);
    expect(emitted.at(-1)).toEqual([EN]);
  });

  it('shows the exact remove-failure message, keeps the track and clears busy', async () => {
    await init([EN]);
    svc.remove.mockRejectedValue(new Error('boom'));
    await fixture.componentInstance.onRemove('en');
    expect(fixture.componentInstance.error()).toBe('Remove failed. Try again.');
    expect(fixture.componentInstance.tracks()).toEqual([EN]);
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('sets busy during a remove and clears it afterwards', async () => {
    await init([EN]);
    let resolve!: () => void;
    svc.remove.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    const p = fixture.componentInstance.onRemove('en');
    expect(fixture.componentInstance.busy()).toBe(true);
    resolve();
    await p;
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('binds the language select to the language signal', async () => {
    await init();
    const select = q('[data-testid="captions-language"]') as HTMLSelectElement;
    select.value = 'fr';
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.language()).toBe('fr');
  });

  it('onInputChange uploads the chosen file and resets the input value', async () => {
    await init();
    const input = { files: [VTT()] as unknown as FileList, value: 'c.vtt' };
    fixture.componentInstance.onInputChange({ target: input } as unknown as Event);
    await fixture.whenStable();
    expect(svc.upload).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  it('onInputChange does nothing when no file is selected, but still resets the value', async () => {
    await init();
    for (const files of [[], null]) {
      const input = { files: files as unknown as FileList | null, value: 'stale' };
      fixture.componentInstance.onInputChange({ target: input } as unknown as Event);
      expect(input.value).toBe('');
    }
    await fixture.whenStable();
    expect(svc.upload).not.toHaveBeenCalled();
  });
});

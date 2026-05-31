import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

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
});

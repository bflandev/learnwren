import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import { VideoStateBadgeComponent } from './video-state-badge.component';
import { VideoStatePollingService } from './polling/video-state-polling.service';

function video(state: Video['state']): Video {
  return {
    id: 'v1' as VideoId,
    ownerInstructorId: 'u1' as Video['ownerInstructorId'],
    courseId: 'c1' as Video['courseId'],
    lessonId: 'l1' as Video['lessonId'],
    state,
    source: { bucket: 'b', path: 'p' },
    createdAt: '2026-05-13T00:00:00.000Z' as Video['createdAt'],
    updatedAt: new Date().toISOString() as Video['updatedAt'],
  };
}

describe('VideoStateBadgeComponent — slice B copy', () => {
  let fixture: ComponentFixture<VideoStateBadgeComponent>;
  let subject: Subject<Video>;

  beforeEach(() => {
    subject = new Subject<Video>();
    TestBed.configureTestingModule({
      imports: [VideoStateBadgeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VideoStatePollingService, useValue: { poll: () => subject.asObservable() } },
      ],
    });
    fixture = TestBed.createComponent(VideoStateBadgeComponent);
  });

  it('shows TRANSCODING copy and a spinner', () => {
    fixture.componentRef.setInput('video', video('TRANSCODING'));
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Processing video');
  });

  it('shows READY copy', () => {
    fixture.componentRef.setInput('video', video('READY'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent as string).toContain('Ready to publish');
  });

  it('shows FAILED copy', () => {
    fixture.componentRef.setInput('video', video('FAILED'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent as string).toContain('Transcoding failed');
  });

  it('updates copy when the polling stream emits a new state', () => {
    fixture.componentRef.setInput('video', video('TRANSCODING'));
    fixture.detectChanges();
    subject.next(video('READY'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent as string).toContain('Ready to publish');
  });

  it('shows stuck-state copy when TRANSCODING is older than the threshold', () => {
    const stale: Video = {
      ...video('TRANSCODING'),
      updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() as Video['updatedAt'],
    };
    fixture.componentRef.setInput('video', stale);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent as string).toContain('Transcoding may have stalled');
  });

  it('keeps the slice A stuck-state copy for PENDING_UPLOAD older than 30m', () => {
    const stale: Video = {
      ...video('PENDING_UPLOAD'),
      updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() as Video['updatedAt'],
    };
    fixture.componentRef.setInput('video', stale);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent as string).toContain('Upload may have stalled');
  });

  it('emits (stateChanged) when the polled video state transitions', () => {
    fixture.componentRef.setInput('video', video('TRANSCODING'));
    const emissions: Video['state'][] = [];
    fixture.componentInstance.stateChanged.subscribe((s) => emissions.push(s));
    fixture.detectChanges();
    subject.next(video('READY'));
    expect(emissions).toEqual(['READY']);
  });

  it('does not emit (stateChanged) when the polled state is unchanged', () => {
    fixture.componentRef.setInput('video', video('TRANSCODING'));
    const emissions: Video['state'][] = [];
    fixture.componentInstance.stateChanged.subscribe((s) => emissions.push(s));
    fixture.detectChanges();
    subject.next(video('TRANSCODING'));
    expect(emissions).toEqual([]);
  });

  it('maps READY to the good pill tone', () => {
    fixture.componentRef.setInput('video', video('READY'));
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('good');
  });

  it('maps FAILED to the bad pill tone', () => {
    fixture.componentRef.setInput('video', video('FAILED'));
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('bad');
  });

  it('maps TRANSCODING to the warn pill tone', () => {
    fixture.componentRef.setInput('video', video('TRANSCODING'));
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('warn');
  });

  it('maps a stalled TRANSCODING video to the bad pill tone', () => {
    const stale: Video = {
      ...video('TRANSCODING'),
      updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() as Video['updatedAt'],
    };
    fixture.componentRef.setInput('video', stale);
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('bad');
  });

  it('maps PENDING_UPLOAD to the warn pill tone', () => {
    fixture.componentRef.setInput('video', video('PENDING_UPLOAD'));
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('warn');
  });

  it('maps a stalled PENDING_UPLOAD video to the bad pill tone', () => {
    const stale: Video = {
      ...video('PENDING_UPLOAD'),
      updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() as Video['updatedAt'],
    };
    fixture.componentRef.setInput('video', stale);
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('bad');
  });

  it('shows "Uploaded — preparing…" for PENDING_UPLOAD (case label)', () => {
    fixture.componentRef.setInput('video', video('PENDING_UPLOAD'));
    fixture.detectChanges();
    expect(fixture.componentInstance.label()).toBe('Uploaded — preparing…');
  });

  it('shows "Uploaded — preparing…" for UPLOADED (case label)', () => {
    fixture.componentRef.setInput('video', video('UPLOADED'));
    fixture.detectChanges();
    expect(fixture.componentInstance.label()).toBe('Uploaded — preparing…');
  });

  it('maps UPLOADED to the warn pill tone', () => {
    fixture.componentRef.setInput('video', video('UPLOADED'));
    fixture.detectChanges();
    expect(fixture.componentInstance.tone()).toBe('warn');
  });

  it('shows the spinner for non-terminal UPLOADED state', () => {
    fixture.componentRef.setInput('video', video('UPLOADED'));
    fixture.detectChanges();
    expect(fixture.componentInstance.showSpinner()).toBe(true);
  });

  it('shows the spinner for non-terminal TRANSCODING state', () => {
    fixture.componentRef.setInput('video', video('TRANSCODING'));
    fixture.detectChanges();
    expect(fixture.componentInstance.showSpinner()).toBe(true);
  });

  it('does NOT show the spinner for terminal READY state', () => {
    fixture.componentRef.setInput('video', video('READY'));
    fixture.detectChanges();
    expect(fixture.componentInstance.showSpinner()).toBe(false);
  });

  it('does NOT show the spinner for terminal FAILED state', () => {
    fixture.componentRef.setInput('video', video('FAILED'));
    fixture.detectChanges();
    expect(fixture.componentInstance.showSpinner()).toBe(false);
  });

  it('does NOT show the spinner for PENDING_UPLOAD (not in the non-terminal list)', () => {
    fixture.componentRef.setInput('video', video('PENDING_UPLOAD'));
    fixture.detectChanges();
    expect(fixture.componentInstance.showSpinner()).toBe(false);
  });

  it('canRetry is true only when PENDING_UPLOAD is stale beyond the stuck threshold', () => {
    const stale: Video = {
      ...video('PENDING_UPLOAD'),
      updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() as Video['updatedAt'],
    };
    fixture.componentRef.setInput('video', stale);
    fixture.detectChanges();
    expect(fixture.componentInstance.canRetry()).toBe(true);
  });

  it('canRetry is false for a fresh PENDING_UPLOAD (under threshold)', () => {
    fixture.componentRef.setInput('video', video('PENDING_UPLOAD'));
    fixture.detectChanges();
    expect(fixture.componentInstance.canRetry()).toBe(false);
  });

  it('canRetry is false for a stale TRANSCODING (only PENDING_UPLOAD has retry)', () => {
    const stale: Video = {
      ...video('TRANSCODING'),
      updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() as Video['updatedAt'],
    };
    fixture.componentRef.setInput('video', stale);
    fixture.detectChanges();
    expect(fixture.componentInstance.canRetry()).toBe(false);
  });

  it('isStuck boundary: just under 30 minutes returns false (strict >)', () => {
    // 100ms shy of the threshold to avoid wall-clock race with the in-component
    // Date.now() reading. The strict > check requires ageMs > 30*60*1000, so this
    // age must be < threshold.
    const justUnder = new Date(Date.now() - (30 * 60 * 1000 - 1000)).toISOString() as Video['updatedAt'];
    const v: Video = { ...video('PENDING_UPLOAD'), updatedAt: justUnder };
    fixture.componentRef.setInput('video', v);
    fixture.detectChanges();
    expect(fixture.componentInstance.canRetry()).toBe(false);
    expect(fixture.componentInstance.label()).toBe('Uploaded — preparing…');
  });
});

describe('VideoStateBadgeComponent — polling gate (ngOnInit)', () => {
  let fixture: ComponentFixture<VideoStateBadgeComponent>;
  let pollSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pollSpy = vi.fn(() => new Subject<Video>().asObservable());
    TestBed.configureTestingModule({
      imports: [VideoStateBadgeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VideoStatePollingService, useValue: { poll: pollSpy } },
      ],
    });
    fixture = TestBed.createComponent(VideoStateBadgeComponent);
  });

  it('starts polling for a NON_TERMINAL state (TRANSCODING)', () => {
    fixture.componentRef.setInput('video', video('TRANSCODING'));
    fixture.detectChanges();
    expect(pollSpy).toHaveBeenCalledTimes(1);
    expect(pollSpy).toHaveBeenCalledWith('v1');
  });

  it('starts polling for a NON_TERMINAL state (UPLOADED)', () => {
    fixture.componentRef.setInput('video', video('UPLOADED'));
    fixture.detectChanges();
    expect(pollSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT poll for a terminal READY state (kills the ngOnInit gate)', () => {
    fixture.componentRef.setInput('video', video('READY'));
    fixture.detectChanges();
    expect(pollSpy).not.toHaveBeenCalled();
  });

  it('does NOT poll for a terminal FAILED state', () => {
    fixture.componentRef.setInput('video', video('FAILED'));
    fixture.detectChanges();
    expect(pollSpy).not.toHaveBeenCalled();
  });
});

describe('VideoStateBadgeComponent — isStuck threshold boundary (strict >)', () => {
  let fixture: ComponentFixture<VideoStateBadgeComponent>;
  const NOW = Date.parse('2026-05-13T12:00:00.000Z');
  const THRESHOLD_MS = 30 * 60 * 1000;

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    TestBed.configureTestingModule({
      imports: [VideoStateBadgeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VideoStatePollingService, useValue: { poll: () => new Subject<Video>().asObservable() } },
      ],
    });
    fixture = TestBed.createComponent(VideoStateBadgeComponent);
  });

  afterEach(() => vi.restoreAllMocks());

  function withAge(state: Video['state'], ageMs: number): void {
    const v: Video = {
      ...video(state),
      updatedAt: new Date(NOW - ageMs).toISOString() as Video['updatedAt'],
    };
    fixture.componentRef.setInput('video', v);
    fixture.detectChanges();
  }

  it('ageMs EXACTLY at the threshold is NOT stuck (strict >, not >=)', () => {
    // ageMs === 30*60*1000 → `ageMs > threshold` is false; a `>=` mutant would
    // flip this to stuck.
    withAge('PENDING_UPLOAD', THRESHOLD_MS);
    expect(fixture.componentInstance.canRetry()).toBe(false);
    expect(fixture.componentInstance.label()).toBe('Uploaded — preparing…');
  });

  it('ageMs one ms over the threshold IS stuck', () => {
    withAge('PENDING_UPLOAD', THRESHOLD_MS + 1);
    expect(fixture.componentInstance.canRetry()).toBe(true);
    expect(fixture.componentInstance.label()).toBe('Upload may have stalled — retry?');
  });
});

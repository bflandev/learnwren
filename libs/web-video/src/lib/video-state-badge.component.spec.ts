import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, beforeEach } from 'vitest';

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
});

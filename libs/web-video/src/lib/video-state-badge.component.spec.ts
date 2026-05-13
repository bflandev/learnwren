import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { Video, VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import { VideoStateBadgeComponent } from './video-state-badge.component';

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'v1' as VideoId,
    ownerInstructorId: 'u1' as Video['ownerInstructorId'],
    courseId: 'c1' as Video['courseId'],
    lessonId: 'l1' as Video['lessonId'],
    state: 'PENDING_UPLOAD',
    source: { bucket: 'b', path: 'p' },
    createdAt: new Date().toISOString() as Video['createdAt'],
    updatedAt: new Date().toISOString() as Video['updatedAt'],
    ...overrides,
  };
}

function build(video: Video) {
  TestBed.configureTestingModule({ imports: [VideoStateBadgeComponent] });
  const fixture = TestBed.createComponent(VideoStateBadgeComponent);
  fixture.componentRef.setInput('video', video);
  fixture.detectChanges();
  return fixture;
}

describe('VideoStateBadgeComponent', () => {
  it('shows "Uploaded" when state is UPLOADED', () => {
    const fixture = build(makeVideo({ state: 'UPLOADED' }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Uploaded');
  });

  it('shows "Processing" for PENDING_UPLOAD within threshold', () => {
    // updatedAt is NOW — well within 30 minutes
    const fixture = build(makeVideo({ state: 'PENDING_UPLOAD' }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Processing');
  });

  it('shows stuck message for PENDING_UPLOAD older than 30 minutes', () => {
    const oldDate = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const fixture = build(
      makeVideo({ state: 'PENDING_UPLOAD', updatedAt: oldDate as Video['updatedAt'] }),
    );
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('stalled');
  });
});

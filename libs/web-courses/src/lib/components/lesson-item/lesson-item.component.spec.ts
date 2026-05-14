import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { CourseId, Lesson, LessonId, ModuleId, Video, VideoId, UserId } from '@learnwren/shared-data-models';
import { VideoService } from '@learnwren/web-video';

import { LessonItemComponent } from './lesson-item.component';

const LESSON: Lesson = {
  id: 'lid-1' as LessonId,
  moduleId: 'mid-1' as ModuleId,
  title: 'Hello',
  order: 0,
  createdAt: '2026-05-12T00:00:00.000Z' as Lesson['createdAt'],
  updatedAt: '2026-05-12T00:00:00.000Z' as Lesson['updatedAt'],
};

describe('LessonItemComponent', () => {
  function build(): ReturnType<typeof TestBed.createComponent<LessonItemComponent>> {
    TestBed.configureTestingModule({
      imports: [LessonItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        VideoService,
      ],
    });
    const fixture = TestBed.createComponent(LessonItemComponent);
    fixture.componentRef.setInput('lesson', LESSON);
    fixture.componentRef.setInput('courseId', 'c1' as CourseId);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the lesson title', () => {
    const fixture = build();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Hello');
  });

  it('renders VideoUploadComponent when lesson.videoId is null', () => {
    const fixture = build();
    expect((fixture.nativeElement as HTMLElement).querySelector('lib-video-upload')).toBeTruthy();
  });

  it('emits rename on commit with a new non-empty title', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.rename, 'emit');
    fixture.componentInstance.startEdit();
    fixture.componentInstance.draftTitle.set('New name');
    fixture.componentInstance.commit();
    expect(spy).toHaveBeenCalledWith('New name');
  });

  it('does NOT emit rename when committed title is empty (reverts)', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.rename, 'emit');
    fixture.componentInstance.startEdit();
    fixture.componentInstance.draftTitle.set('');
    fixture.componentInstance.commit();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits delete when the delete button is clicked', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.delete, 'emit');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="lesson-delete"]')!
      .click();
    expect(spy).toHaveBeenCalled();
  });

  it('renders VideoStateBadgeComponent when lesson.videoId is set', () => {
    const mockVideo: Video = {
      id: 'v1' as VideoId,
      ownerInstructorId: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'lid-1' as LessonId,
      state: 'UPLOADED',
      source: { bucket: 'bucket', path: 'path/video.mp4' },
      createdAt: '2026-05-12T00:00:00.000Z' as Video['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Video['updatedAt'],
    };

    const lessonWithVideo: Lesson = {
      ...LESSON,
      videoId: 'v1' as VideoId,
    };

    const mockApi = { getVideo: vi.fn().mockReturnValue(of(mockVideo)) };

    TestBed.configureTestingModule({
      imports: [LessonItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VideoService, useValue: mockApi },
      ],
    });

    const fixture = TestBed.createComponent(LessonItemComponent);
    fixture.componentRef.setInput('lesson', lessonWithVideo);
    fixture.componentRef.setInput('courseId', 'c1' as CourseId);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('lib-video-state-badge')).toBeTruthy();
    expect(el.querySelector('lib-video-upload')).toBeNull();
  });
});

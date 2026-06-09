import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { CourseId, Lesson, LessonId, ModuleId, Video, VideoCaptionsMeta, VideoId, UserId, VideoKeyId } from '@learnwren/shared-data-models';
import {
  VideoPlayerComponent,
  VideoPlayerService,
  VideoService,
  VideoStateBadgeComponent,
} from '@learnwren/web-video';

import { MaterialsService } from '../../materials/materials.service';
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
    const materialsStub = { listMaterials: vi.fn().mockReturnValue(of([])) };
    TestBed.configureTestingModule({
      imports: [LessonItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        VideoService,
        { provide: MaterialsService, useValue: materialsStub },
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

  it('startEdit() enters edit mode seeded with the current title', () => {
    const c = build().componentInstance;
    c.startEdit();
    expect(c.editing()).toBe(true);
    expect(c.draftTitle()).toBe('Hello');
  });

  it('commit() exits edit mode after a successful rename', () => {
    const c = build().componentInstance;
    c.startEdit();
    c.draftTitle.set('New name');
    c.commit();
    expect(c.editing()).toBe(false);
  });

  it('commit() does NOT emit rename when the title is unchanged, and exits edit mode', () => {
    const c = build().componentInstance;
    const spy = vi.spyOn(c.rename, 'emit');
    c.startEdit();
    c.draftTitle.set('Hello'); // identical to the current lesson title
    c.commit();
    expect(spy).not.toHaveBeenCalled();
    expect(c.editing()).toBe(false);
  });

  it('commit() exits edit mode even when reverting an empty title', () => {
    const c = build().componentInstance;
    c.startEdit();
    c.draftTitle.set('');
    c.commit();
    expect(c.editing()).toBe(false);
  });

  it('commit() trims the draft before emitting', () => {
    const c = build().componentInstance;
    const spy = vi.spyOn(c.rename, 'emit');
    c.startEdit();
    c.draftTitle.set('  Trimmed  ');
    c.commit();
    expect(spy).toHaveBeenCalledWith('Trimmed');
  });

  it('cancel() exits edit mode', () => {
    const c = build().componentInstance;
    c.startEdit();
    c.cancel();
    expect(c.editing()).toBe(false);
  });

  it('onVideoUploaded() emits videoChanged', () => {
    const c = build().componentInstance;
    const spy = vi.spyOn(c.videoChanged, 'emit');
    c.onVideoUploaded();
    expect(spy).toHaveBeenCalled();
  });

  it('emits delete when the delete button is clicked', () => {
    const fixture = build();
    const spy = vi.spyOn(fixture.componentInstance.delete, 'emit');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="lesson-delete"]')!
      .click();
    expect(spy).toHaveBeenCalled();
  });

  it('renders the materials list below the lesson', () => {
    const fixture = build();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="materials-list"]')).not.toBeNull();
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
    const materialsStub = { listMaterials: vi.fn().mockReturnValue(of([])) };

    TestBed.configureTestingModule({
      imports: [LessonItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VideoService, useValue: mockApi },
        { provide: MaterialsService, useValue: materialsStub },
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

describe('LessonItemComponent captionsMeta / captionsTrack', () => {
  const LESSON_WITH_VIDEO: Lesson = {
    id: 'lid-1' as LessonId,
    moduleId: 'mid-1' as ModuleId,
    title: 'Hello',
    order: 0,
    videoId: 'v1' as VideoId,
    createdAt: '2026-05-12T00:00:00.000Z' as Lesson['createdAt'],
    updatedAt: '2026-05-12T00:00:00.000Z' as Lesson['updatedAt'],
  };

  function buildWithVideo(): ReturnType<typeof TestBed.createComponent<LessonItemComponent>> {
    const materialsStub = { listMaterials: vi.fn().mockReturnValue(of([])) };
    TestBed.configureTestingModule({
      imports: [LessonItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        VideoService,
        { provide: MaterialsService, useValue: materialsStub },
      ],
    });
    const fixture = TestBed.createComponent(LessonItemComponent);
    fixture.componentRef.setInput('lesson', LESSON_WITH_VIDEO);
    fixture.componentRef.setInput('courseId', 'c1' as CourseId);
    fixture.detectChanges();
    return fixture;
  }

  it('captionsTrack() returns null when captionsMeta is null', () => {
    const c = buildWithVideo().componentInstance;
    c.captionsMeta.set(null);
    expect(c.captionsTrack()).toBeNull();
  });

  it('captionsTrack() returns a track object when captionsMeta is set and lesson has videoId', () => {
    const c = buildWithVideo().componentInstance;
    const meta: VideoCaptionsMeta = { language: 'en', label: 'English', updatedAt: 'x' };
    c.onCaptionsMeta(meta);
    expect(c.captionsTrack()).toEqual({
      src: '/api/playback/captions/v1',
      srclang: 'en',
      label: 'English',
    });
  });

  it('onCaptionsMeta() sets captionsMeta signal to the provided value', () => {
    const c = buildWithVideo().componentInstance;
    const meta: VideoCaptionsMeta = { language: 'en', label: 'English', updatedAt: 'x' };
    c.onCaptionsMeta(meta);
    expect(c.captionsMeta()).toEqual(meta);
  });

  it('onCaptionsMeta(null) sets captionsMeta to null and captionsTrack returns null', () => {
    const c = buildWithVideo().componentInstance;
    const meta: VideoCaptionsMeta = { language: 'en', label: 'English', updatedAt: 'x' };
    c.onCaptionsMeta(meta);
    c.onCaptionsMeta(null);
    expect(c.captionsMeta()).toBeNull();
    expect(c.captionsTrack()).toBeNull();
  });
});

describe('LessonItemComponent video render switch', () => {
  const READY_VIDEO: Video = {
    id: 'v1' as VideoId,
    ownerInstructorId: 'u1' as UserId,
    courseId: 'c1' as CourseId,
    lessonId: 'lid-1' as LessonId,
    state: 'READY',
    source: { bucket: 'b', path: 'p' },
    output: { bucket: 'o', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
    keyId: 'k1' as VideoKeyId,
    createdAt: '2026-05-12T00:00:00.000Z' as Video['createdAt'],
    updatedAt: '2026-05-12T00:00:00.000Z' as Video['updatedAt'],
  };

  const LESSON_WITH_VIDEO: Lesson = {
    id: 'lid-1' as LessonId,
    moduleId: 'mid-1' as ModuleId,
    title: 'Hello',
    order: 0,
    videoId: 'v1' as VideoId,
    createdAt: '2026-05-12T00:00:00.000Z' as Lesson['createdAt'],
    updatedAt: '2026-05-12T00:00:00.000Z' as Lesson['updatedAt'],
  };

  function bootstrapWith(video: Video): ComponentFixture<LessonItemComponent> {
    const apiStub = { getVideo: vi.fn().mockReturnValue(of(video)) };
    const playerStub = {
      attach: vi.fn().mockReturnValue({ dispose: () => undefined }),
    };
    const materialsStub = { listMaterials: vi.fn().mockReturnValue(of([])) };
    TestBed.configureTestingModule({
      imports: [LessonItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VideoService, useValue: apiStub },
        { provide: VideoPlayerService, useValue: playerStub },
        { provide: MaterialsService, useValue: materialsStub },
      ],
    });
    const fixture = TestBed.createComponent(LessonItemComponent);
    fixture.componentRef.setInput('lesson', LESSON_WITH_VIDEO);
    fixture.componentRef.setInput('courseId', 'c1' as CourseId);
    fixture.detectChanges();
    return fixture;
  }

  it('renders <lib-video-player> when video state is READY', () => {
    const fixture = bootstrapWith(READY_VIDEO);
    expect(fixture.debugElement.query(By.directive(VideoPlayerComponent))).not.toBeNull();
    expect(fixture.debugElement.query(By.directive(VideoStateBadgeComponent))).toBeNull();
  });

  it('renders <lib-video-state-badge> when video state is TRANSCODING', () => {
    const transcoding: Video = { ...READY_VIDEO, state: 'TRANSCODING' };
    const fixture = bootstrapWith(transcoding);
    expect(fixture.debugElement.query(By.directive(VideoStateBadgeComponent))).not.toBeNull();
    expect(fixture.debugElement.query(By.directive(VideoPlayerComponent))).toBeNull();
  });

  it('does NOT render <lib-video-player> when video state is non-READY (UPLOADED)', () => {
    const uploaded: Video = { ...READY_VIDEO, state: 'UPLOADED' };
    const fixture = bootstrapWith(uploaded);
    expect(fixture.debugElement.query(By.directive(VideoPlayerComponent))).toBeNull();
  });

  it('does NOT render <lib-video-state-badge> when video state is READY', () => {
    const fixture = bootstrapWith(READY_VIDEO);
    expect(fixture.debugElement.query(By.directive(VideoStateBadgeComponent))).toBeNull();
  });
});

describe('LessonItemComponent effect memoization (ANG-3)', () => {
  const LESSON_WITH_VIDEO: Lesson = { ...LESSON, videoId: 'v1' as VideoId };

  function bootstrap(
    getVideo: ReturnType<typeof vi.fn>,
    lesson: Lesson,
  ): ComponentFixture<LessonItemComponent> {
    const materialsStub = { listMaterials: vi.fn().mockReturnValue(of([])) };
    TestBed.configureTestingModule({
      imports: [LessonItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VideoService, useValue: { getVideo } },
        { provide: MaterialsService, useValue: materialsStub },
      ],
    });
    const fixture = TestBed.createComponent(LessonItemComponent);
    fixture.componentRef.setInput('lesson', lesson);
    fixture.componentRef.setInput('courseId', 'c1' as CourseId);
    fixture.detectChanges();
    return fixture;
  }

  it('does NOT call getVideo again when a new Lesson object has the SAME videoId', () => {
    const mockVideo: Video = {
      id: 'v1' as VideoId,
      ownerInstructorId: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'lid-1' as LessonId,
      state: 'UPLOADED',
      source: { bucket: 'b', path: 'p' },
      createdAt: '2026-05-12T00:00:00.000Z' as Video['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Video['updatedAt'],
    };
    const getVideo = vi.fn().mockReturnValue(of(mockVideo));
    const fixture = bootstrap(getVideo, LESSON_WITH_VIDEO);
    // Initial effect fires once on construction.
    expect(getVideo).toHaveBeenCalledTimes(1);

    // Produce a new Lesson object identity but same videoId (e.g. parent re-renders).
    const sameVideoId: Lesson = { ...LESSON_WITH_VIDEO, title: 'Renamed' };
    fixture.componentRef.setInput('lesson', sameVideoId);
    TestBed.flushEffects();

    // Still exactly one call — memoized on videoId string.
    expect(getVideo).toHaveBeenCalledTimes(1);
  });

  it('calls getVideo exactly once more when lesson changes to a DIFFERENT videoId', () => {
    const v1: Video = {
      id: 'v1' as VideoId,
      ownerInstructorId: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'lid-1' as LessonId,
      state: 'UPLOADED',
      source: { bucket: 'b', path: 'p' },
      createdAt: '2026-05-12T00:00:00.000Z' as Video['createdAt'],
      updatedAt: '2026-05-12T00:00:00.000Z' as Video['updatedAt'],
    };
    const v2: Video = { ...v1, id: 'v2' as VideoId };
    const getVideo = vi.fn()
      .mockReturnValueOnce(of(v1))
      .mockReturnValueOnce(of(v2));
    const fixture = bootstrap(getVideo, LESSON_WITH_VIDEO);
    expect(getVideo).toHaveBeenCalledTimes(1);

    const differentVideoId: Lesson = { ...LESSON_WITH_VIDEO, videoId: 'v2' as VideoId };
    fixture.componentRef.setInput('lesson', differentVideoId);
    TestBed.flushEffects();

    expect(getVideo).toHaveBeenCalledTimes(2);
    expect(getVideo).toHaveBeenLastCalledWith('v2');
  });
});

describe('LessonItemComponent video-state refetch + effect branches', () => {
  const UPLOADED: Video = {
    id: 'v1' as VideoId,
    ownerInstructorId: 'u1' as UserId,
    courseId: 'c1' as CourseId,
    lessonId: 'lid-1' as LessonId,
    state: 'UPLOADED',
    source: { bucket: 'b', path: 'p' },
    createdAt: '2026-05-12T00:00:00.000Z' as Video['createdAt'],
    updatedAt: '2026-05-12T00:00:00.000Z' as Video['updatedAt'],
  };
  const LESSON_WITH_VIDEO: Lesson = { ...LESSON, videoId: 'v1' as VideoId };

  function bootstrap(
    getVideo: ReturnType<typeof vi.fn>,
    lesson: Lesson,
  ): ComponentFixture<LessonItemComponent> {
    const materialsStub = { listMaterials: vi.fn().mockReturnValue(of([])) };
    TestBed.configureTestingModule({
      imports: [LessonItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VideoService, useValue: { getVideo } },
        { provide: MaterialsService, useValue: materialsStub },
      ],
    });
    const fixture = TestBed.createComponent(LessonItemComponent);
    fixture.componentRef.setInput('lesson', lesson);
    fixture.componentRef.setInput('courseId', 'c1' as CourseId);
    fixture.detectChanges();
    return fixture;
  }

  it('onVideoStateChanged() emits the new state and refetches the video', () => {
    const ready: Video = { ...UPLOADED, state: 'READY' };
    // First call resolves the init effect; second resolves the post-change refetch.
    const getVideo = vi.fn().mockReturnValueOnce(of(UPLOADED)).mockReturnValueOnce(of(ready));
    const c = bootstrap(getVideo, LESSON_WITH_VIDEO).componentInstance;
    const emit = vi.spyOn(c.videoStateChanged, 'emit');

    c.onVideoStateChanged('READY');

    expect(emit).toHaveBeenCalledWith('READY');
    expect(getVideo).toHaveBeenCalledTimes(2); // once in the effect, once on state change
    expect(c.video()?.state).toBe('READY');
  });

  it('onVideoStateChanged() still emits but skips the refetch when the lesson has no video', () => {
    const getVideo = vi.fn();
    const c = bootstrap(getVideo, LESSON).componentInstance; // LESSON has no videoId
    const emit = vi.spyOn(c.videoStateChanged, 'emit');

    c.onVideoStateChanged('FAILED');

    expect(emit).toHaveBeenCalledWith('FAILED');
    expect(getVideo).not.toHaveBeenCalled();
  });

  it('the effect leaves the video signal undefined when the lesson has no videoId', () => {
    const getVideo = vi.fn();
    const c = bootstrap(getVideo, LESSON).componentInstance;
    expect(getVideo).not.toHaveBeenCalled();
    expect(c.video()).toBeUndefined();
  });

  it('the effect leaves the video undefined when getVideo errors', () => {
    const getVideo = vi.fn().mockReturnValue(throwError(() => new Error('boom')));
    const c = bootstrap(getVideo, LESSON_WITH_VIDEO).componentInstance;
    expect(getVideo).toHaveBeenCalledTimes(1);
    expect(c.video()).toBeUndefined();
  });
});

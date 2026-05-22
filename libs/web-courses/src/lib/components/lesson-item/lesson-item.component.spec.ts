import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { CourseId, Lesson, LessonId, ModuleId, Video, VideoId, UserId, VideoKeyId } from '@learnwren/shared-data-models';
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

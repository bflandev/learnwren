import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LessonView } from '@learnwren/shared-data-models';
import { VideoPlayerComponent } from '@learnwren/web-video';

import { LessonPlayerPageComponent } from './lesson-player-page.component';

function makeView(overrides: Partial<LessonView['lesson']> = {}): LessonView {
  return {
    course: { id: 'c-1' as LessonView['course']['id'], title: 'Test Course', status: 'PUBLISHED' },
    lesson: {
      id: 'l-1' as LessonView['lesson']['id'],
      moduleId: 'm-1' as LessonView['lesson']['moduleId'],
      title: 'Intro Lesson',
      description: 'A great lesson',
      videoId: 'vid-1' as LessonView['lesson']['videoId'],
      videoState: 'READY',
      ...overrides,
    },
  };
}

function configure(
  params: { courseId?: string | null; lessonId?: string | null } = {},
) {
  const { courseId = 'c-1', lessonId = 'l-1' } = params;
  const raw: Record<string, string> = {};
  if (courseId !== null) raw['courseId'] = courseId;
  if (lessonId !== null) raw['lessonId'] = lessonId;
  const activatedRouteFake = {
    snapshot: {
      paramMap: convertToParamMap(raw),
    },
  };

  TestBed.configureTestingModule({
    imports: [LessonPlayerPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: activatedRouteFake },
    ],
  });
}

function create(): {
  fixture: ComponentFixture<LessonPlayerPageComponent>;
  http: HttpTestingController;
} {
  const fixture = TestBed.createComponent(LessonPlayerPageComponent);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

const text = (f: ComponentFixture<unknown>) =>
  (f.nativeElement as HTMLElement).textContent ?? '';

const query = (f: ComponentFixture<unknown>, sel: string) =>
  (f.nativeElement as HTMLElement).querySelector(sel);

describe('LessonPlayerPageComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state is LOADING and renders the skeleton', () => {
    configure();
    const { fixture, http } = create();
    expect(query(fixture, '[data-testid="lesson-skeleton"]')).not.toBeNull();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1');
  });

  it('renders lib-video-player with videoId after load resolves with READY video', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();
    const playerDe = fixture.debugElement.query(By.css('lib-video-player'));
    expect(playerDe).not.toBeNull();
    const player = playerDe.componentInstance as VideoPlayerComponent;
    expect(player.videoId()).toBe('vid-1');
  });

  it('sets state to NOT_FOUND and fires no request when courseId param is missing', async () => {
    configure({ courseId: null });
    const { fixture, http } = create();
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone('/api/learn/courses//lessons/l-1');
    expect(text(fixture)).toContain('Lesson not available');
  });

  it('sets state to NOT_FOUND and fires no request when lessonId param is missing', async () => {
    configure({ lessonId: null });
    const { fixture, http } = create();
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone('/api/learn/courses/c-1/lessons/');
    expect(text(fixture)).toContain('Lesson not available');
  });

  it('renders the processing panel when videoState is not READY', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({ videoState: 'TRANSCODING' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="video-processing"]')).not.toBeNull();
    expect(query(fixture, 'lib-video-player')).toBeNull();
  });

  it('renders the processing panel when videoId is null', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({ videoId: null, videoState: null }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="video-processing"]')).not.toBeNull();
    expect(query(fixture, 'lib-video-player')).toBeNull();
  });

  it('renders not-enrolled panel with back-to-course link on 403', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain("not enrolled");
    const link = query(fixture, '[data-testid="back-to-course"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/catalog/c-1');
  });

  it('renders lesson-not-found panel on 404', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush('Not Found', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Lesson not available');
  });

  it('renders generic error panel with Retry button on 500; clicking Retry re-calls getLessonView', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush('Server Error', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Something went wrong');
    const retryBtn = query(fixture, 'button') as HTMLButtonElement | null;
    expect(retryBtn?.textContent?.trim()).toBe('Retry');

    retryBtn?.click();
    fixture.detectChanges();
    // After retry click, a new request should be in-flight
    http.expectOne('/api/learn/courses/c-1/lessons/l-1');
  });

  it('renders the lesson title', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({ title: 'My Lesson' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('My Lesson');
  });
});

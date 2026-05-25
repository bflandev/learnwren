import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ISODateString, LessonView } from '@learnwren/shared-data-models';

import { LessonPlayerPageComponent } from './lesson-player-page.component';

function makeView(
  overrides: Partial<LessonView['lesson']> = {},
  progress: LessonView['progress'] = { completedAt: null },
): LessonView {
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
    progress,
  };
}

function configure() {
  TestBed.configureTestingModule({
    imports: [LessonPlayerPageComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
}

function create(courseId = 'c-1', lessonId = 'l-1'): {
  fixture: ComponentFixture<LessonPlayerPageComponent>;
  http: HttpTestingController;
} {
  const fixture = TestBed.createComponent(LessonPlayerPageComponent);
  const ref = fixture.componentRef as ComponentRef<LessonPlayerPageComponent>;
  ref.setInput('courseId', courseId);
  ref.setInput('lessonId', lessonId);
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
    configure();
  });

  it('initial state is LOADING and renders the skeleton', () => {
    const { fixture, http } = create();
    expect(query(fixture, '[data-testid="lesson-skeleton"]')).not.toBeNull();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1');
  });

  it('renders lib-video-player with videoId after load resolves with READY video', async () => {
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();
    const player = query(fixture, 'lib-video-player');
    expect(player).not.toBeNull();
  });

  it('renders the processing panel when videoState is not READY', async () => {
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
    const { fixture, http } = create('c-1', 'l-1');
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
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush('Not Found', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Lesson not available');
  });

  it('renders generic error panel with Retry button on 500; clicking Retry re-calls getLessonView', async () => {
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
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({ title: 'My Lesson' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('My Lesson');
  });

  describe('Mark as Complete', () => {
    it('renders the Mark as Complete button when progress.completedAt is null', async () => {
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query(fixture, '[data-testid="mark-complete"]')).not.toBeNull();
      expect(query(fixture, '[data-testid="completed-pill"]')).toBeNull();
    });

    it('renders the Completed pill when progress.completedAt is set', async () => {
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: '2026-05-20T00:00:00.000Z' as ISODateString }));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query(fixture, '[data-testid="completed-pill"]')).not.toBeNull();
      expect(query(fixture, '[data-testid="mark-complete"]')).toBeNull();
    });

    it('renders the instructor-preview hint when progress is null', async () => {
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, null));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query(fixture, '[data-testid="instructor-preview-hint"]')).not.toBeNull();
      expect(query(fixture, '[data-testid="mark-complete"]')).toBeNull();
      expect(query(fixture, '[data-testid="completed-pill"]')).toBeNull();
    });

    it('swaps the button for the pill after clicking Mark as Complete', async () => {
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();

      (query(fixture, '[data-testid="mark-complete"]') as HTMLButtonElement).click();
      // The component's onMarkComplete dispatches a POST; flush it.
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1/complete')
        .flush({ completedAt: '2026-05-25T12:00:00.000Z' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(fixture, '[data-testid="completed-pill"]')).not.toBeNull();
      expect(query(fixture, '[data-testid="mark-complete"]')).toBeNull();
    });

    it('shows the revoked banner on a 403 from POST /complete', async () => {
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();

      (query(fixture, '[data-testid="mark-complete"]') as HTMLButtonElement).click();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1/complete')
        .flush({ error: { code: 'NOT_ENROLLED_LESSON' } }, { status: 403, statusText: 'Forbidden' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(fixture, '[data-testid="mark-error-revoked"]')).not.toBeNull();
    });

    it('shows the generic error banner with Retry on other failures', async () => {
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();

      (query(fixture, '[data-testid="mark-complete"]') as HTMLButtonElement).click();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1/complete')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(fixture, '[data-testid="mark-error-other"]')).not.toBeNull();
    });
  });
});

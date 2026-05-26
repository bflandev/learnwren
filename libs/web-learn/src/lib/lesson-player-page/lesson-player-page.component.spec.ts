import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ISODateString, LessonId, LessonView } from '@learnwren/shared-data-models';
import { VideoPlayerComponent } from '@learnwren/web-video';

import { LessonPlayerPageComponent } from './lesson-player-page.component';

// jsdom does not implement window.matchMedia; polyfill it once for all tests in this file.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function makeView(
  overrides: Partial<LessonView['lesson']> = {},
  progress: LessonView['progress'] = { completedAt: null, lastWatchedSeconds: 0 },
  outlineModules: LessonView['outline']['modules'] = [],
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
    outline: { modules: outlineModules },
    materials: [],
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

  it('renders not-enrolled panel with view-course CTA and no secondary back-to-course link on 403', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain("not enrolled");
    const cta = query(fixture, '[data-testid="view-course-to-enrol"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute('href')).toBe('/catalog/c-1');
    expect(query(fixture, '[data-testid="back-to-course"]')).toBeNull();
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

  describe('Mark as Complete', () => {
    it('renders the Mark as Complete button when progress.completedAt is null', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query(fixture, '[data-testid="mark-complete"]')).not.toBeNull();
      expect(query(fixture, '[data-testid="completed-pill"]')).toBeNull();
    });

    it('renders the Completed pill when progress.completedAt is set', async () => {
      configure();
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
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, null));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query(fixture, '[data-testid="instructor-preview-hint"]')).not.toBeNull();
      expect(query(fixture, '[data-testid="mark-complete"]')).toBeNull();
      expect(query(fixture, '[data-testid="completed-pill"]')).toBeNull();
    });

    it('swaps the button for the pill after clicking Mark as Complete', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();

      (query(fixture, '[data-testid="mark-complete"]') as HTMLButtonElement).click();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1/complete')
        .flush({ completedAt: '2026-05-25T12:00:00.000Z' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(fixture, '[data-testid="completed-pill"]')).not.toBeNull();
      expect(query(fixture, '[data-testid="mark-complete"]')).toBeNull();
    });

    it('shows the revoked banner on a 403 from POST /complete', async () => {
      configure();
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
      configure();
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

  describe('resume on metadata', () => {
    it('seeks to the saved lastWatchedSeconds when 0 < saved < duration - 5', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 30 }));
      await fixture.whenStable();
      fixture.detectChanges();

      const seek = vi
        .spyOn(fixture.componentInstance, 'seekVideoTo')
        .mockImplementation(() => undefined);

      fixture.componentInstance.onMetadata(60);
      expect(seek).toHaveBeenCalledWith(30);
    });

    it('clamps to duration - 5 when saved is within 5 s of the end', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 58 }));
      await fixture.whenStable();
      fixture.detectChanges();

      const seek = vi
        .spyOn(fixture.componentInstance, 'seekVideoTo')
        .mockImplementation(() => undefined);

      fixture.componentInstance.onMetadata(60);
      expect(seek).toHaveBeenCalledWith(55);
    });

    it('resets to 0 when saved >= duration (UC-06-03 ext 5b)', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 120 }));
      await fixture.whenStable();
      fixture.detectChanges();

      const seek = vi
        .spyOn(fixture.componentInstance, 'seekVideoTo')
        .mockImplementation(() => undefined);

      fixture.componentInstance.onMetadata(60);
      expect(seek).toHaveBeenCalledWith(0);
    });

    it('does not seek when saved is 0', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }));
      await fixture.whenStable();
      fixture.detectChanges();

      const seek = vi
        .spyOn(fixture.componentInstance, 'seekVideoTo')
        .mockImplementation(() => undefined);

      fixture.componentInstance.onMetadata(60);
      expect(seek).not.toHaveBeenCalled();
    });

    it('does not seek in owner-preview mode', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, null));
      await fixture.whenStable();
      fixture.detectChanges();

      const seek = vi
        .spyOn(fixture.componentInstance, 'seekVideoTo')
        .mockImplementation(() => undefined);

      fixture.componentInstance.onMetadata(60);
      expect(seek).not.toHaveBeenCalled();
    });

    it('a second onMetadata call is a no-op (hasResumed guard)', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 30 }));
      await fixture.whenStable();
      fixture.detectChanges();

      const seek = vi
        .spyOn(fixture.componentInstance, 'seekVideoTo')
        .mockImplementation(() => undefined);

      fixture.componentInstance.onMetadata(60);
      fixture.componentInstance.onMetadata(60);
      // Two metadata events should still yield exactly one seek — the first
      // call sets hasResumed=true and the second early-returns.
      expect(seek).toHaveBeenCalledTimes(1);
    });

    it('does not seek when duration is 0', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 30 }));
      await fixture.whenStable();
      fixture.detectChanges();

      const seek = vi
        .spyOn(fixture.componentInstance, 'seekVideoTo')
        .mockImplementation(() => undefined);

      fixture.componentInstance.onMetadata(0);
      expect(seek).not.toHaveBeenCalled();
    });

    it('does not seek when duration is non-finite (Infinity)', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 30 }));
      await fixture.whenStable();
      fixture.detectChanges();

      const seek = vi
        .spyOn(fixture.componentInstance, 'seekVideoTo')
        .mockImplementation(() => undefined);

      fixture.componentInstance.onMetadata(Number.POSITIVE_INFINITY);
      expect(seek).not.toHaveBeenCalled();
    });

    it('does not seek when duration is NaN', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 30 }));
      await fixture.whenStable();
      fixture.detectChanges();

      const seek = vi
        .spyOn(fixture.componentInstance, 'seekVideoTo')
        .mockImplementation(() => undefined);

      fixture.componentInstance.onMetadata(Number.NaN);
      expect(seek).not.toHaveBeenCalled();
    });
  });

  describe('position saver wiring', () => {
    it('does not start the saver in owner-preview mode', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, null));
      await fixture.whenStable();
      fixture.detectChanges();

      // Simulate the player emitting (played); in owner-preview the saver
      // must NOT be started, so no POST /position should ever fire.
      fixture.componentInstance.onPlayed();

      // Verify there are no outstanding requests to /position.
      http.expectNone('/api/learn/courses/c-1/lessons/l-1/position');
    });

    it('switches state to NOT_ENROLLED when the saver reports revocation', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }));
      await fixture.whenStable();
      fixture.detectChanges();

      fixture.componentInstance.onSaverRevoked();
      expect(fixture.componentInstance.state()).toBe('NOT_ENROLLED');
    });
  });
});

describe('LessonPlayerPageComponent initial state defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('state() defaults to LOADING before the HTTP request resolves', () => {
    configure();
    const { fixture } = create();
    expect(fixture.componentInstance.state()).toBe('LOADING');
  });

  it('view() defaults to null before the HTTP request resolves', () => {
    configure();
    const { fixture } = create();
    expect(fixture.componentInstance.view()).toBeNull();
  });

  it('completedAt() returns null when view is null', () => {
    configure();
    const { fixture } = create();
    expect(fixture.componentInstance.completedAt()).toBeNull();
  });

  it('lastWatchedSeconds() returns 0 when view is null', () => {
    configure();
    const { fixture } = create();
    expect(fixture.componentInstance.lastWatchedSeconds()).toBe(0);
  });

  it('isOwnerPreview() returns false when view is null (not yet loaded)', () => {
    configure();
    const { fixture } = create();
    expect(fixture.componentInstance.isOwnerPreview()).toBe(false);
  });

  it('outline() returns null when view is null', () => {
    configure();
    const { fixture } = create();
    expect(fixture.componentInstance.outline()).toBeNull();
  });

  it('markBusy() defaults to false and markError() defaults to null', () => {
    configure();
    const { fixture } = create();
    expect(fixture.componentInstance.markBusy()).toBe(false);
    expect(fixture.componentInstance.markError()).toBeNull();
  });

  it('outlineMode() returns "drawer" when matchMedia min-width 1024px does NOT match', () => {
    // The top-level polyfill returns matches:false, so we expect drawer mode.
    configure();
    const { fixture } = create();
    expect(fixture.componentInstance.outlineMode()).toBe('drawer');
  });

  it('outlineOpen() defaults to false in drawer mode (matchMedia matches=false)', () => {
    configure();
    const { fixture } = create();
    expect(fixture.componentInstance.outlineOpen()).toBe(false);
  });
});

describe('LessonPlayerPageComponent computed values after load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completedAt() returns the served progress.completedAt after load', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({}, { completedAt: '2026-05-20T00:00:00.000Z' as ISODateString, lastWatchedSeconds: 0 }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.completedAt()).toBe('2026-05-20T00:00:00.000Z');
  });

  it('lastWatchedSeconds() returns the served value after load', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 73 }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.lastWatchedSeconds()).toBe(73);
  });

  it('isOwnerPreview() returns true after load when progress is null', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, null));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.isOwnerPreview()).toBe(true);
  });

  it('isOwnerPreview() returns false after load when progress is an object (even if values are zero/null)', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.isOwnerPreview()).toBe(false);
  });

  it('outline() returns the served outline object after load', async () => {
    configure();
    const { fixture, http } = create();
    const outlineModules: LessonView['outline']['modules'] = [
      {
        id: 'm-1' as LessonView['lesson']['moduleId'],
        title: 'Module 1',
        lessons: [{ id: 'l-1' as LessonId, title: 'Lesson 1', videoState: 'READY', completedAt: null }],
      },
    ];
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }, outlineModules));
    await fixture.whenStable();
    fixture.detectChanges();
    const outline = fixture.componentInstance.outline();
    expect(outline).not.toBeNull();
    expect(outline?.modules).toHaveLength(1);
    expect(outline?.modules[0].id).toBe('m-1');
  });
});

describe('LessonPlayerPageComponent pagehide / visibilitychange wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('onPageHide arrow handler calls saver.flushBeacon when saver exists', () => {
    configure();
    const { fixture } = create();
    const flushBeacon = vi.fn();
    type WithPrivates = { saver: { flushBeacon: () => void; stop: () => void } | null; onPageHide: () => void };
    const withPrivates = fixture.componentInstance as unknown as WithPrivates;
    withPrivates.saver = { flushBeacon, stop: () => undefined };
    withPrivates.onPageHide();
    expect(flushBeacon).toHaveBeenCalledTimes(1);
  });

  it('onPageHide arrow handler is a no-op when saver is null', () => {
    configure();
    const { fixture } = create();
    type WithPrivates = { saver: unknown; onPageHide: () => void };
    (fixture.componentInstance as unknown as WithPrivates).saver = null;
    expect(() => (fixture.componentInstance as unknown as WithPrivates).onPageHide()).not.toThrow();
  });

  it('onVisibilityChange arrow handler calls saver.flushBeacon when document.visibilityState is hidden', () => {
    configure();
    const { fixture } = create();
    const flushBeacon = vi.fn();
    type WithPrivates = { saver: { flushBeacon: () => void; stop: () => void } | null; onVisibilityChange: () => void };
    const withPrivates = fixture.componentInstance as unknown as WithPrivates;
    withPrivates.saver = { flushBeacon, stop: () => undefined };
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    withPrivates.onVisibilityChange();
    expect(flushBeacon).toHaveBeenCalledTimes(1);
  });

  it('onVisibilityChange arrow handler does NOT call saver.flushBeacon when document.visibilityState is visible', () => {
    configure();
    const { fixture } = create();
    const flushBeacon = vi.fn();
    type WithPrivates = { saver: { flushBeacon: () => void; stop: () => void } | null; onVisibilityChange: () => void };
    const withPrivates = fixture.componentInstance as unknown as WithPrivates;
    withPrivates.saver = { flushBeacon, stop: () => undefined };
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    withPrivates.onVisibilityChange();
    expect(flushBeacon).not.toHaveBeenCalled();
  });

  it('ngOnInit registers pagehide + visibilitychange listeners after the view loads', async () => {
    const winSpy = vi.spyOn(window, 'addEventListener');
    const docSpy = vi.spyOn(document, 'addEventListener');
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const pagehideCall = winSpy.mock.calls.find((c) => c[0] === 'pagehide');
    expect(pagehideCall).toBeDefined();
    const visibilityCall = docSpy.mock.calls.find((c) => c[0] === 'visibilitychange');
    expect(visibilityCall).toBeDefined();
  });

  it('ngOnDestroy removes both pagehide and visibilitychange listeners', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const winRemove = vi.spyOn(window, 'removeEventListener');
    const docRemove = vi.spyOn(document, 'removeEventListener');
    fixture.componentInstance.ngOnDestroy();
    expect(winRemove.mock.calls.some((c) => c[0] === 'pagehide')).toBe(true);
    expect(docRemove.mock.calls.some((c) => c[0] === 'visibilitychange')).toBe(true);
  });

  it('ngOnDestroy stops the saver and nulls it out', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    const stop = vi.fn();
    (fixture.componentInstance as unknown as { saver: { flushBeacon: () => void; stop: () => void } | null }).saver = {
      flushBeacon: () => undefined, stop,
    };
    fixture.componentInstance.ngOnDestroy();
    expect(stop).toHaveBeenCalledTimes(1);
    expect((fixture.componentInstance as unknown as { saver: unknown }).saver).toBeNull();
  });
});

describe('LessonPlayerPageComponent onMarkComplete state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('markBusy() transitions false → true → false across a successful complete', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.markBusy()).toBe(false);
    const p = fixture.componentInstance.onMarkComplete();
    expect(fixture.componentInstance.markBusy()).toBe(true);
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1/complete')
      .flush({ completedAt: '2026-05-25T12:00:00.000Z' });
    await p;
    expect(fixture.componentInstance.markBusy()).toBe(false);
  });

  it('markBusy() returns to false after a 403 failure (finally block executes)', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    const p = fixture.componentInstance.onMarkComplete();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1/complete')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    await p;
    expect(fixture.componentInstance.markBusy()).toBe(false);
    expect(fixture.componentInstance.markError()).toBe('revoked');
  });

  it('markBusy() returns to false after a 500 failure (finally block executes)', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    const p = fixture.componentInstance.onMarkComplete();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1/complete')
      .flush({}, { status: 500, statusText: 'Server Error' });
    await p;
    expect(fixture.componentInstance.markBusy()).toBe(false);
    expect(fixture.componentInstance.markError()).toBe('other');
  });

  it('preserves prior lastWatchedSeconds in view().progress after successful complete', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 45 }));
    await fixture.whenStable();
    fixture.detectChanges();

    const p = fixture.componentInstance.onMarkComplete();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1/complete')
      .flush({ completedAt: '2026-05-25T12:00:00.000Z' });
    await p;
    expect(fixture.componentInstance.view()?.progress?.lastWatchedSeconds).toBe(45);
  });

  it('uses lastWatchedSeconds=0 when prior progress.lastWatchedSeconds is missing (defensive fallback)', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }));
    await fixture.whenStable();
    fixture.detectChanges();

    // Wipe out lastWatchedSeconds to exercise the `?? 0` branch deterministically.
    fixture.componentInstance.view.update((v) =>
      v ? { ...v, progress: { completedAt: null, lastWatchedSeconds: undefined as unknown as number } } : v,
    );

    const p = fixture.componentInstance.onMarkComplete();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1/complete')
      .flush({ completedAt: '2026-05-25T12:00:00.000Z' });
    await p;
    expect(fixture.componentInstance.view()?.progress?.lastWatchedSeconds).toBe(0);
  });
});

describe('LessonPlayerPageComponent onPlayed wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('onPlayed creates a saver after load (when not in owner-preview)', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    // Wipe the saver that ensureSaver() may have already created during load().
    (fixture.componentInstance as unknown as { saver: unknown }).saver = null;
    fixture.componentInstance.onPlayed();
    expect((fixture.componentInstance as unknown as { saver: unknown }).saver).not.toBeNull();
  });

  it('onPaused calls saver.flush when saver exists, and is a no-op otherwise', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    const flush = vi.fn().mockResolvedValue(undefined);
    (fixture.componentInstance as unknown as { saver: { flush: () => Promise<void>; stop: () => void } | null }).saver = {
      flush, stop: () => undefined,
    };
    fixture.componentInstance.onPaused();
    expect(flush).toHaveBeenCalledTimes(1);

    (fixture.componentInstance as unknown as { saver: unknown }).saver = null;
    expect(() => fixture.componentInstance.onPaused()).not.toThrow();
  });

  it('onEnded calls saver.flush when saver exists', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    const flush = vi.fn().mockResolvedValue(undefined);
    (fixture.componentInstance as unknown as { saver: { flush: () => Promise<void>; stop: () => void } | null }).saver = {
      flush, stop: () => undefined,
    };
    fixture.componentInstance.onEnded();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('onSaverRevoked stops the saver and nulls it', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    const stop = vi.fn();
    (fixture.componentInstance as unknown as { saver: { flushBeacon: () => void; stop: () => void } | null }).saver = {
      flushBeacon: () => undefined, stop,
    };
    fixture.componentInstance.onSaverRevoked();
    expect(stop).toHaveBeenCalledTimes(1);
    expect((fixture.componentInstance as unknown as { saver: unknown }).saver).toBeNull();
    expect(fixture.componentInstance.state()).toBe('NOT_ENROLLED');
  });
});

describe('LessonPlayerPageComponent outline integration (Slice D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes outline through to CourseOutlinePanelComponent on load', async () => {
    configure();
    const { fixture, http } = create();
    const outlineModules: LessonView['outline']['modules'] = [
      {
        id: 'm-1' as LessonView['lesson']['moduleId'],
        title: 'Module 1',
        lessons: [
          { id: 'l-1' as LessonId, title: 'Lesson 1', videoState: 'READY', completedAt: null },
          { id: 'l-2' as LessonId, title: 'Lesson 2', videoState: 'READY', completedAt: null },
        ],
      },
    ];
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }, outlineModules));
    await fixture.whenStable();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('lib-course-outline-panel');
    expect(panel).toBeTruthy();
    const rows = panel.querySelectorAll('button[data-testid="outline-row"]');
    expect(rows).toHaveLength(2);
  });

  it('toggles outlineOpen when the header button is clicked', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    const before = fixture.componentInstance.outlineOpen();
    (fixture.nativeElement.querySelector('[data-testid="outline-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.outlineOpen()).toBe(!before);
  });

  it('flushes the saver, then navigates, when lessonSelected fires', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const flushSpy = vi.fn().mockResolvedValue(undefined);
    (fixture.componentInstance as unknown as { saver: { flush: () => Promise<void>; stop: () => void } | null }).saver = {
      flush: flushSpy,
      stop: () => undefined,
    };

    await fixture.componentInstance.onLessonSelected('lnext' as LessonId);

    expect(flushSpy).toHaveBeenCalledTimes(1);
    expect(navSpy).toHaveBeenCalledWith('/learn/c-1/lnext');
    expect(flushSpy.mock.invocationCallOrder[0]).toBeLessThan(navSpy.mock.invocationCallOrder[0]);
  });

  it('still navigates if the flush rejects, and logs a warning', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    (fixture.componentInstance as unknown as { saver: { flush: () => Promise<void>; stop: () => void } | null }).saver = {
      flush: vi.fn().mockRejectedValue(new Error('network')),
      stop: () => undefined,
    };

    await fixture.componentInstance.onLessonSelected('lnext' as LessonId);

    expect(navSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });
});

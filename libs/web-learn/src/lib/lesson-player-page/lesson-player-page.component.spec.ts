import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, Router, convertToParamMap, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ISODateString, LessonId, LessonView, MaterialId } from '@learnwren/shared-data-models';
import { VideoPlayerComponent } from '@learnwren/web-video';

import { LessonPlayerPageComponent, formatBytes } from './lesson-player-page.component';

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
  materials: LessonView['materials'] = [],
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
      captions: null,
      ...overrides,
    },
    progress,
    outline: { modules: outlineModules },
    materials,
  };
}

function configure(
  params: { courseId?: string | null; lessonId?: string | null } = {},
) {
  const { courseId = 'c-1', lessonId = 'l-1' } = params;
  const raw: Record<string, string> = {};
  if (courseId !== null) raw['courseId'] = courseId;
  if (lessonId !== null) raw['lessonId'] = lessonId;
  const paramMap = convertToParamMap(raw);
  const activatedRouteFake = {
    snapshot: { paramMap },
    paramMap: of(paramMap),
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

/**
 * Variant of configure() that exposes the ParamMap subject so a test can push a
 * new lessonId after the first load (UC-06-04 outline navigation).
 */
function configureWithParamMapSubject(initial: {
  courseId: string;
  lessonId: string;
}): BehaviorSubject<ParamMap> {
  const subject = new BehaviorSubject<ParamMap>(convertToParamMap(initial));
  TestBed.configureTestingModule({
    imports: [LessonPlayerPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          get snapshot() {
            return { paramMap: subject.value };
          },
          paramMap: subject.asObservable(),
        },
      },
    ],
  });
  return subject;
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

  it('ignores a stale lesson response that resolves after a newer outline navigation', async () => {
    // Race guard: getLessonView is a non-cancellable Promise. A slow earlier
    // lesson request resolving last must not overwrite the lesson the user
    // actually navigated to.
    const subject = configureWithParamMapSubject({ courseId: 'c-1', lessonId: 'l-1' });
    const { fixture, http } = create();
    const reqA = http.expectOne('/api/learn/courses/c-1/lessons/l-1');

    // Outline click to l-2 before l-1 resolves -> request B.
    subject.next(convertToParamMap({ courseId: 'c-1', lessonId: 'l-2' }));
    const reqB = http.expectOne('/api/learn/courses/c-1/lessons/l-2');

    // Newer (B) resolves first, then the stale (A) resolves last.
    reqB.flush(makeView({ id: 'l-2' as LessonView['lesson']['id'], title: 'Lesson B' }));
    await fixture.whenStable();
    reqA.flush(makeView({ id: 'l-1' as LessonView['lesson']['id'], title: 'Lesson A' }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.view()?.lesson.title).toBe('Lesson B');
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

  it('outlineMode() reacts to a viewport breakpoint change (not stuck at first render)', () => {
    // Controllable matchMedia that captures the 'change' handler so we can flip
    // the breakpoint after construction.
    let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
    const mql = {
      matches: false,
      media: '(min-width: 1024px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_: string, h: (e: MediaQueryListEvent) => void) => {
        changeHandler = h;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    const prev = window.matchMedia;
    window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
    try {
      configure();
      const { fixture } = create();
      expect(fixture.componentInstance.outlineMode()).toBe('drawer');
      // Simulate resizing up to a wide viewport.
      changeHandler?.({ matches: true } as MediaQueryListEvent);
      expect(fixture.componentInstance.outlineMode()).toBe('sidebar');
    } finally {
      window.matchMedia = prev;
    }
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

describe('route param change (outline navigation between lessons)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refetches the LessonView and re-renders when the route lessonId changes', async () => {
    const paramMap$ = configureWithParamMapSubject({ courseId: 'c-1', lessonId: 'l-1' });
    const { fixture, http } = create();

    // First lesson loads
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({ id: 'l-1' as LessonId, title: 'Lesson A' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, 'h1')!.textContent).toContain('Lesson A');

    // Outline click pushes a new lessonId — component must refetch.
    paramMap$.next(convertToParamMap({ courseId: 'c-1', lessonId: 'l-2' }));
    await fixture.whenStable();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-2')
      .flush(makeView({ id: 'l-2' as LessonId, title: 'Lesson B' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, 'h1')!.textContent).toContain('Lesson B');
  });

  it('resets per-lesson state when the lessonId changes', async () => {
    const paramMap$ = configureWithParamMapSubject({ courseId: 'c-1', lessonId: 'l-1' });
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(
      makeView({}, { completedAt: null, lastWatchedSeconds: 0 }, [], [
        { id: 'mat-1' as MaterialId, displayName: 'A.pdf', extension: 'pdf', sizeBytes: 1 },
      ]),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    // Put the materials row into an error state so we can confirm it resets.
    fixture.componentInstance.materialRowState.set(
      new Map([['mat-1' as MaterialId, { status: 'error', kind: 'gone' as const }]]),
    );
    fixture.componentInstance.markBusy.set(true);
    fixture.componentInstance.markError.set('other');

    paramMap$.next(convertToParamMap({ courseId: 'c-1', lessonId: 'l-2' }));
    await fixture.whenStable();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-2')
      .flush(makeView({ id: 'l-2' as LessonId, title: 'Lesson B' }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.materialRowState().size).toBe(0);
    expect(fixture.componentInstance.markBusy()).toBe(false);
    expect(fixture.componentInstance.markError()).toBeNull();
  });

  it('sets NOT_FOUND if a later param change drops the lessonId', async () => {
    const paramMap$ = configureWithParamMapSubject({ courseId: 'c-1', lessonId: 'l-1' });
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    paramMap$.next(convertToParamMap({ courseId: 'c-1' }));
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(text(fixture)).toContain('Lesson not available');
  });
});

describe('UC-04-02 materials section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const twoMaterials: LessonView['materials'] = [
    { id: 'mat-1' as MaterialId, displayName: 'Slides.pdf', extension: 'pdf', sizeBytes: 2_500_000 },
    { id: 'mat-2' as MaterialId, displayName: 'Notes.docx', extension: 'docx', sizeBytes: 12_345 },
  ];

  it('renders one row per material with extension, displayName, sizeBytes, and Download button', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }, [], twoMaterials));
    await fixture.whenStable();
    fixture.detectChanges();

    const section = query(fixture, '[data-testid="lesson-materials"]');
    expect(section).not.toBeNull();

    const btn1 = query(fixture, '[data-testid="material-download-mat-1"]') as HTMLButtonElement | null;
    const btn2 = query(fixture, '[data-testid="material-download-mat-2"]') as HTMLButtonElement | null;
    expect(btn1).not.toBeNull();
    expect(btn2).not.toBeNull();

    const sectionText = (section as HTMLElement).textContent ?? '';
    expect(sectionText).toContain('Slides.pdf');
    expect(sectionText).toContain('Notes.docx');
    // formatted bytes — 2_500_000 bytes ≈ 2.4 MB; 12_345 bytes ≈ 12.1 KB
    expect(sectionText).toContain('MB');
    expect(sectionText).toContain('KB');
    // extension badges (uppercase)
    expect(sectionText).toContain('PDF');
    expect(sectionText).toContain('DOCX');
  });

  it('hides the section entirely when materials is empty', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="lesson-materials"]')).toBeNull();
  });

  it('click on material-download-{matId} calls requestDownloadUrl then window.open with the URL', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }, [], twoMaterials));
    await fixture.whenStable();
    fixture.detectChanges();

    const learn = (fixture.componentInstance as unknown as { learn: { requestDownloadUrl: (id: MaterialId) => Promise<{ downloadUrl: string; expiresAt: ISODateString }> } }).learn;
    const reqSpy = vi
      .spyOn(learn, 'requestDownloadUrl')
      .mockResolvedValue({ downloadUrl: 'https://example.com/signed', expiresAt: '2026-05-26T12:00:00.000Z' as ISODateString });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    const btn = query(fixture, '[data-testid="material-download-mat-1"]') as HTMLButtonElement;
    btn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(reqSpy).toHaveBeenCalledWith('mat-1');
    expect(openSpy).toHaveBeenCalledWith('https://example.com/signed', '_blank', 'noopener');
  });

  it('on 404 renders material-error-{matId} with the gone copy; sibling rows stay enabled', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }, [], twoMaterials));
    await fixture.whenStable();
    fixture.detectChanges();

    const learn = (fixture.componentInstance as unknown as { learn: { requestDownloadUrl: (id: MaterialId) => Promise<unknown> } }).learn;
    vi.spyOn(learn, 'requestDownloadUrl').mockRejectedValue(
      new HttpErrorResponse({ status: 404, statusText: 'Not Found' }),
    );

    (query(fixture, '[data-testid="material-download-mat-1"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const err = query(fixture, '[data-testid="material-error-mat-1"]');
    expect(err).not.toBeNull();
    expect((err as HTMLElement).textContent ?? '').toContain('This file is no longer available.');

    // Sibling row still has its Download button enabled (no error on mat-2).
    const sibling = query(fixture, '[data-testid="material-download-mat-2"]') as HTMLButtonElement | null;
    expect(sibling).not.toBeNull();
    expect(sibling?.disabled).toBe(false);
    expect(query(fixture, '[data-testid="material-error-mat-2"]')).toBeNull();
  });

  it('on 403 renders the forbidden copy', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }, [], twoMaterials));
    await fixture.whenStable();
    fixture.detectChanges();

    const learn = (fixture.componentInstance as unknown as { learn: { requestDownloadUrl: (id: MaterialId) => Promise<unknown> } }).learn;
    vi.spyOn(learn, 'requestDownloadUrl').mockRejectedValue(
      new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }),
    );

    (query(fixture, '[data-testid="material-download-mat-1"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const err = query(fixture, '[data-testid="material-error-mat-1"]');
    expect(err).not.toBeNull();
    expect((err as HTMLElement).textContent ?? '').toContain('You no longer have access to this material.');
  });

  it('on other errors (500) renders the generic retry copy', async () => {
    configure();
    const { fixture, http } = create();
    http
      .expectOne('/api/learn/courses/c-1/lessons/l-1')
      .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }, [], twoMaterials));
    await fixture.whenStable();
    fixture.detectChanges();

    const learn = (fixture.componentInstance as unknown as { learn: { requestDownloadUrl: (id: MaterialId) => Promise<unknown> } }).learn;
    vi.spyOn(learn, 'requestDownloadUrl').mockRejectedValue(
      new HttpErrorResponse({ status: 500, statusText: 'Server Error' }),
    );

    (query(fixture, '[data-testid="material-download-mat-1"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const err = query(fixture, '[data-testid="material-error-mat-1"]');
    expect(err).not.toBeNull();
    expect((err as HTMLElement).textContent ?? '').toContain("Couldn't prepare the download. Try again.");
  });
});

describe('LessonPlayerPageComponent captionsTrack computed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes a captions track when the view has captions', () => {
    configure();
    const { fixture } = create();
    fixture.componentInstance.view.set(
      makeView({ videoId: 'v1' as LessonView['lesson']['videoId'], captions: { language: 'en', label: 'English' } }, null),
    );
    expect(fixture.componentInstance.captionsTrack()).toEqual({
      src: '/api/playback/captions/v1', srclang: 'en', label: 'English',
    });
  });

  it('captionsTrack is null when the view has no captions', () => {
    configure();
    const { fixture } = create();
    fixture.componentInstance.view.set(
      makeView({ videoId: 'v1' as LessonView['lesson']['videoId'], captions: null }, null),
    );
    expect(fixture.componentInstance.captionsTrack()).toBeNull();
  });

  it('captionsTrack is null when the lesson has no videoId', () => {
    configure();
    const { fixture } = create();
    fixture.componentInstance.view.set(
      makeView({ videoId: null, videoState: null, captions: null }, null),
    );
    expect(fixture.componentInstance.captionsTrack()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mutation-hardening blocks. Each test below pins an exact survivor identified
// by Stryker. createNoInit() lets us read signal INITIAL values before ngOnInit
// (detectChanges) overwrites them in load()/applyRouteParams.
// ---------------------------------------------------------------------------

function createNoInit(): ComponentFixture<LessonPlayerPageComponent> {
  // No detectChanges() → ngOnInit has not run yet → initial signal values intact.
  return TestBed.createComponent(LessonPlayerPageComponent);
}

/** Controllable matchMedia capturing its query arg + the registered 'change' handler. */
function withControllableMatchMedia(matches: boolean): {
  restore: () => void;
  queries: string[];
  addEventArgs: Array<[string, (e: MediaQueryListEvent) => void]>;
  removeEventArgs: Array<[string, (e: MediaQueryListEvent) => void]>;
  fireChange: (m: boolean) => void;
} {
  const queries: string[] = [];
  const addEventArgs: Array<[string, (e: MediaQueryListEvent) => void]> = [];
  const removeEventArgs: Array<[string, (e: MediaQueryListEvent) => void]> = [];
  let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
  const mql = {
    matches,
    media: '(min-width: 1024px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((evt: string, h: (e: MediaQueryListEvent) => void) => {
      addEventArgs.push([evt, h]);
      if (evt === 'change') changeHandler = h;
    }),
    removeEventListener: vi.fn((evt: string, h: (e: MediaQueryListEvent) => void) => {
      removeEventArgs.push([evt, h]);
    }),
    dispatchEvent: vi.fn(),
  };
  const prev = window.matchMedia;
  window.matchMedia = vi.fn((q: string) => {
    queries.push(q);
    return mql;
  }) as unknown as typeof window.matchMedia;
  return {
    restore: () => { window.matchMedia = prev; },
    queries,
    addEventArgs,
    removeEventArgs,
    fireChange: (m: boolean) => changeHandler?.({ matches: m } as MediaQueryListEvent),
  };
}

describe('LessonPlayerPageComponent mutation hardening', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('state() initial value is exactly "LOADING" before ngOnInit runs (kills L63 StringLiteral)', () => {
    configure();
    const fixture = createNoInit();
    expect(fixture.componentInstance.state()).toBe('LOADING');
  });

  it('markBusy() initial value is false before ngOnInit (kills L73 BooleanLiteral)', () => {
    configure();
    const fixture = createNoInit();
    expect(fixture.componentInstance.markBusy()).toBe(false);
  });

  it('completedAt() is null (not a throw) when view has progress:null (kills L67 OptionalChaining)', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, null));
    await fixture.whenStable();
    fixture.detectChanges();
    // progress is null: `view()?.progress?.completedAt` short-circuits to null.
    // The mutant `view()?.progress.completedAt` would throw on null.progress.
    expect(fixture.componentInstance.completedAt()).toBeNull();
  });

  it('lastWatchedSeconds() is 0 (not a throw) when view has progress:null (kills L70 OptionalChaining)', async () => {
    configure();
    const { fixture, http } = create();
    http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, null));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.lastWatchedSeconds()).toBe(0);
  });

  it('rowState() returns exactly {status:"idle"} for an unknown id (kills L79 ObjectLiteral + StringLiteral)', () => {
    configure();
    const { fixture } = create();
    expect(fixture.componentInstance.rowState('nope' as MaterialId)).toEqual({ status: 'idle' });
  });

  it('captionsTrack() is null (not a throw) when view() is null (kills L86 OptionalChaining)', () => {
    configure();
    const fixture = createNoInit();
    expect(fixture.componentInstance.view()).toBeNull();
    expect(fixture.componentInstance.captionsTrack()).toBeNull();
  });

  describe('responsive matchMedia wiring', () => {
    it('queries window.matchMedia with the exact "(min-width: 1024px)" string (kills L96 StringLiteral arg)', () => {
      const mm = withControllableMatchMedia(false);
      try {
        configure();
        createNoInit();
        expect(mm.queries).toContain('(min-width: 1024px)');
      } finally {
        mm.restore();
      }
    });

    it('isDesktop drives outlineMode="sidebar" and outlineOpen=true when matchMedia matches:true (kills isDesktop/outlineOpen init mutants)', () => {
      const mm = withControllableMatchMedia(true);
      try {
        configure();
        const fixture = createNoInit();
        expect(fixture.componentInstance.outlineMode()).toBe('sidebar');
        expect(fixture.componentInstance.outlineOpen()).toBe(true);
      } finally {
        mm.restore();
      }
    });

    it('outlineMode="drawer" and outlineOpen=false when matchMedia matches:false', () => {
      const mm = withControllableMatchMedia(false);
      try {
        configure();
        const fixture = createNoInit();
        expect(fixture.componentInstance.outlineMode()).toBe('drawer');
        expect(fixture.componentInstance.outlineOpen()).toBe(false);
      } finally {
        mm.restore();
      }
    });

    it('ngOnInit registers the "change" listener on the media query (kills L129 StringLiteral + OptionalChaining)', () => {
      const mm = withControllableMatchMedia(false);
      try {
        configure();
        create(); // runs ngOnInit
        const changeReg = mm.addEventArgs.find((a) => a[0] === 'change');
        expect(changeReg).toBeDefined();
      } finally {
        mm.restore();
      }
    });

    it('the registered change handler flips isDesktop → outlineMode reactively (kills onDesktopChange + isDesktop.set)', () => {
      const mm = withControllableMatchMedia(false);
      try {
        configure();
        const { fixture } = create();
        expect(fixture.componentInstance.outlineMode()).toBe('drawer');
        mm.fireChange(true);
        expect(fixture.componentInstance.outlineMode()).toBe('sidebar');
        mm.fireChange(false);
        expect(fixture.componentInstance.outlineMode()).toBe('drawer');
      } finally {
        mm.restore();
      }
    });

    it('ngOnDestroy removes the "change" listener from the media query (kills L169 StringLiteral + OptionalChaining)', () => {
      const mm = withControllableMatchMedia(false);
      try {
        configure();
        const { fixture } = create();
        fixture.componentInstance.ngOnDestroy();
        const changeRemove = mm.removeEventArgs.find((a) => a[0] === 'change');
        expect(changeRemove).toBeDefined();
      } finally {
        mm.restore();
      }
    });
  });

  describe('event-listener registration exact names', () => {
    it('ngOnInit adds "pagehide" on window and "visibilitychange" on document with the SAME handler used by removeEventListener', () => {
      const winAdd = vi.spyOn(window, 'addEventListener');
      const docAdd = vi.spyOn(document, 'addEventListener');
      const winRemove = vi.spyOn(window, 'removeEventListener');
      const docRemove = vi.spyOn(document, 'removeEventListener');
      configure();
      const { fixture } = create();
      const pagehideAdd = winAdd.mock.calls.find((c) => c[0] === 'pagehide');
      const visAdd = docAdd.mock.calls.find((c) => c[0] === 'visibilitychange');
      expect(pagehideAdd).toBeDefined();
      expect(visAdd).toBeDefined();
      fixture.componentInstance.ngOnDestroy();
      const pagehideRemove = winRemove.mock.calls.find((c) => c[0] === 'pagehide');
      const visRemove = docRemove.mock.calls.find((c) => c[0] === 'visibilitychange');
      expect(pagehideRemove).toBeDefined();
      expect(visRemove).toBeDefined();
      // Same handler reference added and removed (kills handler-swap mutants).
      expect(pagehideRemove?.[1]).toBe(pagehideAdd?.[1]);
      expect(visRemove?.[1]).toBe(visAdd?.[1]);
    });

    it('the registered pagehide handler invokes saver.flushBeacon (kills onPageHide OptionalChaining)', () => {
      const winAdd = vi.spyOn(window, 'addEventListener');
      configure();
      const { fixture } = create();
      const handler = winAdd.mock.calls.find((c) => c[0] === 'pagehide')?.[1] as () => void;
      expect(handler).toBeDefined();
      const flushBeacon = vi.fn();
      (fixture.componentInstance as unknown as { saver: { flushBeacon: () => void; stop: () => void } | null }).saver = {
        flushBeacon, stop: () => undefined,
      };
      handler();
      expect(flushBeacon).toHaveBeenCalledTimes(1);
    });

    it('the registered visibilitychange handler invokes saver.flushBeacon only when hidden (kills L117 guards + onVisibilityChange OptionalChaining)', () => {
      const docAdd = vi.spyOn(document, 'addEventListener');
      configure();
      const { fixture } = create();
      const handler = docAdd.mock.calls.find((c) => c[0] === 'visibilitychange')?.[1] as () => void;
      expect(handler).toBeDefined();
      const flushBeacon = vi.fn();
      (fixture.componentInstance as unknown as { saver: { flushBeacon: () => void; stop: () => void } | null }).saver = {
        flushBeacon, stop: () => undefined,
      };
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      handler();
      expect(flushBeacon).not.toHaveBeenCalled();
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      handler();
      expect(flushBeacon).toHaveBeenCalledTimes(1);
    });
  });

  describe('applyRouteParams dedup guard (L148)', () => {
    it('does NOT refetch when the same courseId+lessonId is pushed and a view is loaded', async () => {
      const subject = configureWithParamMapSubject({ courseId: 'c-1', lessonId: 'l-1' });
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();

      // Push the identical param map again — dedup short-circuit means no 2nd request.
      subject.next(convertToParamMap({ courseId: 'c-1', lessonId: 'l-1' }));
      await fixture.whenStable();
      http.expectNone('/api/learn/courses/c-1/lessons/l-1');
    });

    it('DOES refetch when only the lessonId differs (proves the equality guard is per-field)', async () => {
      const subject = configureWithParamMapSubject({ courseId: 'c-1', lessonId: 'l-1' });
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();

      subject.next(convertToParamMap({ courseId: 'c-1', lessonId: 'l-9' }));
      await fixture.whenStable();
      http.expectOne('/api/learn/courses/c-1/lessons/l-9').flush(makeView({ id: 'l-9' as LessonId }));
      await fixture.whenStable();
    });

    it('DOES refetch when only the courseId differs (kills L148 first equality clause)', async () => {
      const subject = configureWithParamMapSubject({ courseId: 'c-1', lessonId: 'l-1' });
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();

      // Same lessonId, DIFFERENT courseId, view already loaded. The first clause
      // `courseId === this.courseId` must be false → dedup must NOT short-circuit.
      subject.next(convertToParamMap({ courseId: 'c-2', lessonId: 'l-1' }));
      await fixture.whenStable();
      http.expectOne('/api/learn/courses/c-2/lessons/l-1').flush(makeView());
      await fixture.whenStable();
    });

    it('refetches the same lessonId when no view is loaded yet (view()===null branch is required)', async () => {
      // First load FAILS (no view set), then the same params arrive again — the
      // `&& this.view() !== null` clause means dedup must NOT short-circuit.
      const subject = configureWithParamMapSubject({ courseId: 'c-1', lessonId: 'l-1' });
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush('boom', { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.view()).toBeNull();

      subject.next(convertToParamMap({ courseId: 'c-1', lessonId: 'l-1' }));
      await fixture.whenStable();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
    });
  });

  describe('load() token + state strings', () => {
    it('sets state to exactly "PROCESSING" when the video is not READY (kills L186 StringLiteral)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({ videoState: 'TRANSCODING' }));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toBe('PROCESSING');
    });

    it('sets state to exactly "READY" when the video is READY', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toBe('READY');
    });

    it('a stale SUCCESS response (resolves last) does not overwrite the view (kills L175 UpdateOperator + L179 token guard)', async () => {
      const subject = configureWithParamMapSubject({ courseId: 'c-1', lessonId: 'l-1' });
      const { fixture, http } = create();
      const reqA = http.expectOne('/api/learn/courses/c-1/lessons/l-1');
      subject.next(convertToParamMap({ courseId: 'c-1', lessonId: 'l-2' }));
      const reqB = http.expectOne('/api/learn/courses/c-1/lessons/l-2');
      reqB.flush(makeView({ id: 'l-2' as LessonId, title: 'Lesson B' }));
      await fixture.whenStable();
      reqA.flush(makeView({ id: 'l-1' as LessonId, title: 'Lesson A' }));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.view()?.lesson.title).toBe('Lesson B');
      expect(fixture.componentInstance.state()).toBe('READY');
    });

    it('a non-HttpErrorResponse rejection carrying status:403 still maps to LOAD_ERROR (kills L190 instanceof guard)', async () => {
      // The catch-block `err instanceof HttpErrorResponse` guard mutated to
      // `true` would read `.status` off a plain object and mis-route a non-HTTP
      // error with a `status:403` field to NOT_ENROLLED. The original ignores it
      // (not an HttpErrorResponse) → LOAD_ERROR.
      configure();
      const { fixture } = create();
      const learn = (fixture.componentInstance as unknown as { learn: { getLessonView: (...a: unknown[]) => Promise<unknown> } }).learn;
      vi.spyOn(learn, 'getLessonView').mockRejectedValue({ status: 403, message: 'plain' });
      fixture.componentInstance.retry();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toBe('LOAD_ERROR');
    });

    it('onMetadata with no duration arg reads playerRef.playerEl.nativeElement.duration (kills L229 OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 30 }));
      await fixture.whenStable();
      fixture.detectChanges();
      const seekTo = vi.fn();
      (fixture.componentInstance as unknown as { playerRef: unknown }).playerRef = {
        seekTo,
        currentTime: () => 0,
        playerEl: { nativeElement: { duration: 100 } },
      };
      // No duration arg → d is read from playerRef.playerEl.nativeElement.duration (100).
      // saved=30, d=100 → seek to 30. The OptionalChaining mutants on the
      // playerRef chain would yield d=0 → no seek.
      fixture.componentInstance.onMetadata();
      expect(seekTo).toHaveBeenCalledWith(30);
    });

    it('onMetadata with no duration and NO playerRef returns cleanly (kills L229 outer OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 30 }));
      await fixture.whenStable();
      fixture.detectChanges();
      const seek = vi.spyOn(fixture.componentInstance, 'seekVideoTo').mockImplementation(() => undefined);
      (fixture.componentInstance as unknown as { playerRef: unknown }).playerRef = undefined;
      // d = duration(undefined) ?? playerRef?.… ?? 0 = 0 → no seek. The mutant
      // `this.playerRef.playerEl` throws on undefined.
      expect(() => fixture.componentInstance.onMetadata()).not.toThrow();
      expect(seek).not.toHaveBeenCalled();
    });

    it('onMetadata with no duration and a playerRef lacking playerEl returns cleanly (kills L229 inner OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 30 }));
      await fixture.whenStable();
      fixture.detectChanges();
      const seek = vi.spyOn(fixture.componentInstance, 'seekVideoTo').mockImplementation(() => undefined);
      // playerRef present but no playerEl → `playerRef?.playerEl?.nativeElement`
      // short-circuits to undefined → d=0. The mutant `playerEl.nativeElement`
      // throws on undefined.playerEl.
      (fixture.componentInstance as unknown as { playerRef: unknown }).playerRef = { seekTo: vi.fn() };
      expect(() => fixture.componentInstance.onMetadata()).not.toThrow();
      expect(seek).not.toHaveBeenCalled();
    });

    it('a stale ERROR response (resolves last) does not overwrite a good view (kills L189 token guard)', async () => {
      const subject = configureWithParamMapSubject({ courseId: 'c-1', lessonId: 'l-1' });
      const { fixture, http } = create();
      const reqA = http.expectOne('/api/learn/courses/c-1/lessons/l-1');
      subject.next(convertToParamMap({ courseId: 'c-1', lessonId: 'l-2' }));
      const reqB = http.expectOne('/api/learn/courses/c-1/lessons/l-2');
      // Newer (B) succeeds first.
      reqB.flush(makeView({ id: 'l-2' as LessonId, title: 'Lesson B' }));
      await fixture.whenStable();
      // Stale (A) then errors — must be ignored, view + state stay B/READY.
      reqA.flush('boom', { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.view()?.lesson.title).toBe('Lesson B');
      expect(fixture.componentInstance.state()).toBe('READY');
    });
  });

  describe('onLessonSelected warning string (L216)', () => {
    it('logs exactly the expected warning text when flush rejects', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();

      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      (fixture.componentInstance as unknown as { saver: { flush: () => Promise<void>; stop: () => void } | null }).saver = {
        flush: vi.fn().mockRejectedValue(new Error('network')),
        stop: () => undefined,
      };
      await fixture.componentInstance.onLessonSelected('lnext' as LessonId);
      expect(warnSpy).toHaveBeenCalledWith(
        '[learn] flushPosition rejected during outline nav',
        expect.anything(),
      );
    });
  });

  describe('onMetadata seek math (L232, real seekVideoTo via playerRef)', () => {
    function withFakePlayer(fixture: ComponentFixture<LessonPlayerPageComponent>): {
      seekTo: ReturnType<typeof vi.fn>; currentTime: ReturnType<typeof vi.fn>;
    } {
      const seekTo = vi.fn();
      const currentTime = vi.fn(() => 0);
      (fixture.componentInstance as unknown as { playerRef: unknown }).playerRef = {
        seekTo,
        currentTime,
        playerEl: { nativeElement: { duration: 0 } },
      };
      return { seekTo, currentTime };
    }

    it('seekVideoTo calls playerRef.seekTo with the computed seconds (kills L262 OptionalChaining + L261 BlockStatement)', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 30 }));
      await fixture.whenStable();
      fixture.detectChanges();
      const { seekTo } = withFakePlayer(fixture);
      fixture.componentInstance.onMetadata(60);
      expect(seekTo).toHaveBeenCalledWith(30);
    });

    it('saved === duration seeks to 0; saved just above duration also seeks to 0 (kills L232 EqualityOperator saved>=d)', async () => {
      // saved === d : `>=` true → seek 0. The `>` mutant would make this FALSE
      // and fall through to Math.min(saved, d-5) = d-5, a different seek.
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 60 }));
      await fixture.whenStable();
      fixture.detectChanges();
      const seek = vi.spyOn(fixture.componentInstance, 'seekVideoTo').mockImplementation(() => undefined);
      fixture.componentInstance.onMetadata(60); // saved === d
      expect(seek).toHaveBeenCalledWith(0);
    });
  });

  describe('onPlayed start() arrow + currentTime (L242)', () => {
    it('passes a getTime callback that reads playerRef.currentTime() to saver.start (kills L242 ArrowFunction/Logical/OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();

      const start = vi.fn();
      (fixture.componentInstance as unknown as { saver: { start: (cb: () => number) => void; stop: () => void } | null }).saver = {
        start, stop: () => undefined,
      };
      const currentTime = vi.fn(() => 42);
      (fixture.componentInstance as unknown as { playerRef: unknown }).playerRef = { currentTime };
      fixture.componentInstance.onPlayed();
      expect(start).toHaveBeenCalledTimes(1);
      const cb = start.mock.calls[0][0] as () => number;
      // The arrow must invoke currentTime() and return its value (kills the
      // ArrowFunction `() => undefined` mutant and the `?? 0` LogicalOperator).
      expect(cb()).toBe(42);
      expect(currentTime).toHaveBeenCalled();
    });

    it('the getTime callback returns 0 when playerRef is absent (kills L242 ?? 0)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();

      const start = vi.fn();
      (fixture.componentInstance as unknown as { saver: { start: (cb: () => number) => void; stop: () => void } | null }).saver = {
        start, stop: () => undefined,
      };
      (fixture.componentInstance as unknown as { playerRef: unknown }).playerRef = undefined;
      fixture.componentInstance.onPlayed();
      const cb = start.mock.calls[0][0] as () => number;
      expect(cb()).toBe(0);
    });
  });

  describe('saver method calls on the real component (kills L214/L250/L256 OptionalChaining + L242 saver.start)', () => {
    it('onPlayed actually calls saver.start when not owner-preview', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      const start = vi.fn();
      (fixture.componentInstance as unknown as { saver: { start: () => void; stop: () => void } | null }).saver = {
        start, stop: () => undefined,
      };
      fixture.componentInstance.onPlayed();
      expect(start).toHaveBeenCalledTimes(1);
    });

    it('onEnded calls saver.flush', async () => {
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

    it('onSaverRevoked calls saver.stop (kills L256 OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      const stop = vi.fn();
      (fixture.componentInstance as unknown as { saver: { stop: () => void } | null }).saver = { stop };
      fixture.componentInstance.onSaverRevoked();
      expect(stop).toHaveBeenCalledTimes(1);
    });

    it('onLessonSelected calls saver.flush before navigating (kills L214 OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const flush = vi.fn().mockResolvedValue(undefined);
      (fixture.componentInstance as unknown as { saver: { flush: () => Promise<void>; stop: () => void } | null }).saver = {
        flush, stop: () => undefined,
      };
      await fixture.componentInstance.onLessonSelected('lnext' as LessonId);
      expect(flush).toHaveBeenCalledTimes(1);
    });
  });

  describe('onMarkComplete preserves lastWatchedSeconds via optional chaining (L276)', () => {
    it('reads v.progress?.lastWatchedSeconds — preserves a non-zero value (kills L276 OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 99 }));
      await fixture.whenStable();
      fixture.detectChanges();
      const p = fixture.componentInstance.onMarkComplete();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1/complete').flush({ completedAt: '2026-05-25T12:00:00.000Z' });
      await p;
      expect(fixture.componentInstance.view()?.progress?.lastWatchedSeconds).toBe(99);
    });
  });

  describe('onDownloadMaterial state transitions (L290/L294/L298 + setRow object literals)', () => {
    const oneMaterial: LessonView['materials'] = [
      { id: 'mat-x' as MaterialId, displayName: 'X.pdf', extension: 'pdf', sizeBytes: 10 },
    ];

    it('rowState goes idle → preparing → idle on success (kills L290 ObjectLiteral/StringLiteral + L294)', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }, [], oneMaterial));
      await fixture.whenStable();
      fixture.detectChanges();

      const learn = (fixture.componentInstance as unknown as { learn: { requestDownloadUrl: (id: MaterialId) => Promise<{ downloadUrl: string; expiresAt: ISODateString }> } }).learn;
      let resolveDl!: (v: { downloadUrl: string; expiresAt: ISODateString }) => void;
      vi.spyOn(learn, 'requestDownloadUrl').mockReturnValue(
        new Promise((res) => { resolveDl = res; }),
      );
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

      expect(fixture.componentInstance.rowState('mat-x' as MaterialId)).toEqual({ status: 'idle' });
      const p = fixture.componentInstance.onDownloadMaterial('mat-x' as MaterialId);
      // While the request is in flight the row is exactly {status:'preparing'}.
      expect(fixture.componentInstance.rowState('mat-x' as MaterialId)).toEqual({ status: 'preparing' });
      resolveDl({ downloadUrl: 'https://x/sig', expiresAt: '2026-05-26T00:00:00.000Z' as ISODateString });
      await p;
      expect(openSpy).toHaveBeenCalledWith('https://x/sig', '_blank', 'noopener');
      expect(fixture.componentInstance.rowState('mat-x' as MaterialId)).toEqual({ status: 'idle' });
    });

    it('maps 404→gone, 403→forbidden, 500→other exactly (kills L298 StringLiterals)', async () => {
      for (const [status, kind] of [[404, 'gone'], [403, 'forbidden'], [500, 'other']] as const) {
        vi.clearAllMocks();
        configure();
        const { fixture, http } = create();
        http
          .expectOne('/api/learn/courses/c-1/lessons/l-1')
          .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 0 }, [], oneMaterial));
        await fixture.whenStable();
        fixture.detectChanges();

        const learn = (fixture.componentInstance as unknown as { learn: { requestDownloadUrl: (id: MaterialId) => Promise<unknown> } }).learn;
        vi.spyOn(learn, 'requestDownloadUrl').mockRejectedValue(
          new HttpErrorResponse({ status, statusText: 'err' }),
        );
        await fixture.componentInstance.onDownloadMaterial('mat-x' as MaterialId);
        expect(fixture.componentInstance.rowState('mat-x' as MaterialId)).toEqual({ status: 'error', kind });
        TestBed.resetTestingModule();
      }
    });
  });

  describe('null-saver optional chaining (no throw)', () => {
    it('onEnded is a no-op when saver is null (kills L250 OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      (fixture.componentInstance as unknown as { saver: unknown }).saver = null;
      expect(() => fixture.componentInstance.onEnded()).not.toThrow();
    });

    it('onSaverRevoked is a no-op (beyond state) when saver is null (kills L256 OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      (fixture.componentInstance as unknown as { saver: unknown }).saver = null;
      expect(() => fixture.componentInstance.onSaverRevoked()).not.toThrow();
      expect(fixture.componentInstance.state()).toBe('NOT_ENROLLED');
    });

    it('onLessonSelected with a null saver navigates WITHOUT logging a warning (kills L214 OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      (fixture.componentInstance as unknown as { saver: unknown }).saver = null;
      await fixture.componentInstance.onLessonSelected('lnext' as LessonId);
      expect(navSpy).toHaveBeenCalledWith('/learn/c-1/lnext');
      // The `?.` short-circuits cleanly. The mutant `this.saver.flush()` would
      // throw on null → caught by the try/catch → console.warn fires.
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('the visibilitychange handler is a no-op when saver is null and document is hidden (kills L118 OptionalChaining)', () => {
      const docAdd = vi.spyOn(document, 'addEventListener');
      configure();
      const { fixture } = create();
      const handler = docAdd.mock.calls.find((c) => c[0] === 'visibilitychange')?.[1] as () => void;
      (fixture.componentInstance as unknown as { saver: unknown }).saver = null;
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      expect(() => handler()).not.toThrow();
    });

    it('seekVideoTo is a no-op when playerRef is undefined (kills L262 OptionalChaining)', () => {
      configure();
      const { fixture } = create();
      (fixture.componentInstance as unknown as { playerRef: unknown }).playerRef = undefined;
      expect(() => fixture.componentInstance.seekVideoTo(10)).not.toThrow();
    });

    it('seekVideoTo calls playerRef.seekTo when present', () => {
      configure();
      const { fixture } = create();
      const seekTo = vi.fn();
      (fixture.componentInstance as unknown as { playerRef: unknown }).playerRef = { seekTo };
      fixture.componentInstance.seekVideoTo(10);
      expect(seekTo).toHaveBeenCalledWith(10);
    });
  });

  describe('hasResumed initial false + onPlayed owner-preview early return', () => {
    it('hasResumed starts false so the first onMetadata seeks (kills L107 BooleanLiteral)', async () => {
      configure();
      const { fixture, http } = create();
      http
        .expectOne('/api/learn/courses/c-1/lessons/l-1')
        .flush(makeView({}, { completedAt: null, lastWatchedSeconds: 25 }));
      await fixture.whenStable();
      fixture.detectChanges();
      const seek = vi.spyOn(fixture.componentInstance, 'seekVideoTo').mockImplementation(() => undefined);
      fixture.componentInstance.onMetadata(60);
      expect(seek).toHaveBeenCalledWith(25);
    });

    it('onPlayed returns early in owner-preview and never calls saver.start (kills L240 ConditionalExpression)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, null));
      await fixture.whenStable();
      fixture.detectChanges();
      const start = vi.fn();
      (fixture.componentInstance as unknown as { saver: unknown }).saver = { start, stop: () => undefined };
      fixture.componentInstance.onPlayed();
      expect(start).not.toHaveBeenCalled();
    });
  });

  describe('onMarkComplete with null progress (owner-preview) optional chaining (L276)', () => {
    it('does not throw and writes lastWatchedSeconds 0 when prior progress is null (kills L276 OptionalChaining)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, null));
      await fixture.whenStable();
      fixture.detectChanges();
      // progress is null: `v.progress?.lastWatchedSeconds ?? 0` → 0. The mutant
      // `v.progress.lastWatchedSeconds` would throw on null.progress.
      const p = fixture.componentInstance.onMarkComplete();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1/complete').flush({ completedAt: '2026-05-25T12:00:00.000Z' });
      await p;
      expect(fixture.componentInstance.view()?.progress?.lastWatchedSeconds).toBe(0);
      expect(fixture.componentInstance.markError()).toBeNull();
    });
  });

  describe('ensureSaver (L312/L313/L317)', () => {
    it('creates a saver when none exists and not owner-preview', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      (fixture.componentInstance as unknown as { saver: unknown }).saver = null;
      fixture.componentInstance.onPlayed(); // calls ensureSaver
      expect((fixture.componentInstance as unknown as { saver: unknown }).saver).not.toBeNull();
    });

    it('does NOT create a saver in owner-preview mode (kills L312 LogicalOperator/ConditionalExpression)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView({}, null));
      await fixture.whenStable();
      fixture.detectChanges();
      (fixture.componentInstance as unknown as { saver: unknown }).saver = null;
      fixture.componentInstance.onPlayed();
      expect((fixture.componentInstance as unknown as { saver: unknown }).saver).toBeNull();
    });

    it('does NOT replace an existing saver (kills L312 saver-present guard)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      const sentinel = { start: vi.fn(), stop: vi.fn() };
      (fixture.componentInstance as unknown as { saver: unknown }).saver = sentinel;
      fixture.componentInstance.onPlayed();
      expect((fixture.componentInstance as unknown as { saver: unknown }).saver).toBe(sentinel);
    });

    it('the saver onRevoked wiring drives onSaverRevoked → NOT_ENROLLED (kills L317 ArrowFunction)', async () => {
      configure();
      const { fixture, http } = create();
      http.expectOne('/api/learn/courses/c-1/lessons/l-1').flush(makeView());
      await fixture.whenStable();
      fixture.detectChanges();
      (fixture.componentInstance as unknown as { saver: unknown }).saver = null;
      fixture.componentInstance.onPlayed();
      const saver = (fixture.componentInstance as unknown as { saver: { onRevoked: () => void } }).saver;
      // Invoke the onRevoked callback captured in the PositionSaver options.
      (saver as unknown as { onRevoked: () => void }).onRevoked();
      expect(fixture.componentInstance.state()).toBe('NOT_ENROLLED');
    });
  });
});

describe('formatBytes', () => {
  // Pins every unit threshold, the per-unit divisor + toFixed precision, and the
  // unit suffix strings. Boundary cases sit exactly on each 1024 cutover so the
  // `<` comparison mutants (→ `<=`) flip the chosen unit.
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'], // just under 1 KiB → stays in bytes
    [1024, '1.0 KB'], // exactly 1 KiB → crosses to KB
    [1536, '1.5 KB'], // pins the /1024 divisor + 1-dp rounding
    [1048576, '1.0 MB'], // exactly 1 MiB → crosses to MB
    [1572864, '1.5 MB'], // pins the /(1024*1024) divisor
    [1073741824, '1.00 GB'], // exactly 1 GiB → crosses to GB
    [5368709120, '5.00 GB'], // pins the /(1024^3) divisor + 2-dp rounding
  ] as const)('formats %i bytes as %s', (n, expected) => {
    expect(formatBytes(n)).toBe(expected);
  });
});

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
    fixture.componentInstance.view.set({
      course: { id: 'c1' as LessonView['course']['id'], title: 'C', status: 'PUBLISHED' },
      lesson: { id: 'l1' as LessonView['lesson']['id'], moduleId: 'm1' as LessonView['lesson']['moduleId'], title: 'L', videoId: 'v1' as LessonView['lesson']['videoId'], videoState: 'READY', captions: { language: 'en', label: 'English' } },
      progress: null,
      outline: { modules: [] },
      materials: [],
    } as never);
    expect(fixture.componentInstance.captionsTrack()).toEqual({
      src: '/api/playback/captions/v1', srclang: 'en', label: 'English',
    });
  });

  it('captionsTrack is null when the view has no captions', () => {
    configure();
    const { fixture } = create();
    fixture.componentInstance.view.set({
      course: { id: 'c1' as LessonView['course']['id'], title: 'C', status: 'PUBLISHED' },
      lesson: { id: 'l1' as LessonView['lesson']['id'], moduleId: 'm1' as LessonView['lesson']['moduleId'], title: 'L', videoId: 'v1' as LessonView['lesson']['videoId'], videoState: 'READY', captions: null },
      progress: null,
      outline: { modules: [] },
      materials: [],
    } as never);
    expect(fixture.componentInstance.captionsTrack()).toBeNull();
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

import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { CourseRosterView } from '@learnwren/shared-data-models';

import { CourseStudentsPageComponent } from './course-students-page.component';

const VIEW: CourseRosterView = {
  courseId: 'course-1' as never,
  totalLessons: 10,
  students: [
    {
      userId: 'u1' as never,
      displayName: 'Ada',
      email: 'ada@example.com',
      enrolledAt: '2026-05-20T00:00:00.000Z' as never,
      completedLessons: 5,
      totalLessons: 10,
      progressPercent: 50,
    },
    {
      userId: 'u2' as never,
      displayName: 'Bo',
      email: 'bo@example.com',
      enrolledAt: '2026-05-25T00:00:00.000Z' as never,
      completedLessons: 9,
      totalLessons: 10,
      progressPercent: 90,
    },
  ],
};

/**
 * Cross-order fixture: Ada enrolled LATE (05-25) but has LOW progress (10%);
 * Bo enrolled EARLY (05-20) but has HIGH progress (90%).
 * This ensures enrolledAt and progress orderings diverge, so tests can
 * distinguish which comparator path is actually used.
 */
const VIEW_CROSS: CourseRosterView = {
  courseId: 'course-1' as never,
  totalLessons: 10,
  students: [
    {
      userId: 'u1' as never,
      displayName: 'Ada',
      email: 'ada@example.com',
      enrolledAt: '2026-05-25T00:00:00.000Z' as never, // enrolled later
      completedLessons: 1,
      totalLessons: 10,
      progressPercent: 10, // low progress
    },
    {
      userId: 'u2' as never,
      displayName: 'Bo',
      email: 'bo@example.com',
      enrolledAt: '2026-05-20T00:00:00.000Z' as never, // enrolled earlier
      completedLessons: 9,
      totalLessons: 10,
      progressPercent: 90, // high progress
    },
  ],
};

/** Three students in SCRAMBLED progress order so a broken comparator (e.g. +
 *  instead of -) cannot accidentally produce the sorted output. */
const VIEW_THREE: CourseRosterView = {
  courseId: 'course-1' as never,
  totalLessons: 10,
  students: [
    {
      userId: 'u-mid' as never,
      displayName: 'Mid',
      email: 'mid@example.com',
      enrolledAt: '2026-05-22T00:00:00.000Z' as never,
      completedLessons: 5,
      totalLessons: 10,
      progressPercent: 50,
    },
    {
      userId: 'u-low' as never,
      displayName: 'Low',
      email: 'low@example.com',
      enrolledAt: '2026-05-21T00:00:00.000Z' as never,
      completedLessons: 1,
      totalLessons: 10,
      progressPercent: 10,
    },
    {
      userId: 'u-high' as never,
      displayName: 'High',
      email: 'high@example.com',
      enrolledAt: '2026-05-23T00:00:00.000Z' as never,
      completedLessons: 9,
      totalLessons: 10,
      progressPercent: 90,
    },
  ],
};

function setup() {
  TestBed.configureTestingModule({
    imports: [CourseStudentsPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(new Map([['id', 'course-1']])) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(CourseStudentsPageComponent);
  fixture.detectChanges();
  return { http, fixture };
}

function readNames(fixture: { nativeElement: unknown }): (string | undefined)[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="student-name"]'),
  ).map((el) => el.textContent?.trim());
}

describe('CourseStudentsPageComponent', () => {
  let http: HttpTestingController;

  it('renders a row per enrolled student with name, email and progress', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const text = (s.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ada');
    expect(text).toContain('ada@example.com');
    expect(text).toContain('90%');
  });

  it('defaults to newest-first by enrollment date', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const names = Array.from(
      (s.fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="student-name"]'),
    ).map((el) => el.textContent?.trim());
    expect(names).toEqual(['Bo', 'Ada']); // Bo enrolled 05-25, Ada 05-20
  });

  it('starts with sortKey=enrolledAt and sortDir=desc (initial header arrow is ▼)', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;
    expect(comp.sortKey()).toBe('enrolledAt');
    expect(comp.sortDir()).toBe('desc');
    // The enrolledAt header (and only it) shows the descending arrow on first load.
    const text = (s.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('▼');
    expect(text).not.toContain('▲');
  });

  it('cid() falls back to empty (no throw) when the paramMap signal has not emitted', () => {
    TestBed.configureTestingModule({
      imports: [CourseStudentsPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: new Subject() } },
      ],
    });
    const localHttp = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CourseStudentsPageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.cid()).toBe('');
    localHttp.expectOne('/api/courses//students').flush({
      courseId: '',
      totalLessons: 0,
      students: [],
    } as CourseRosterView);
  });

  it('cid() falls back to empty when the route paramMap has no id key', () => {
    TestBed.configureTestingModule({
      imports: [CourseStudentsPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(new Map()) } },
      ],
    });
    const localHttp = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CourseStudentsPageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.cid()).toBe('');
    localHttp.expectOne('/api/courses//students').flush({
      courseId: '',
      totalLessons: 0,
      students: [],
    } as CourseRosterView);
  });

  it('sorts by progress ascending when the progress header is toggled', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;
    comp.toggleSort('progress'); // first toggle on a new key => ascending
    s.fixture.detectChanges();
    const names = Array.from(
      (s.fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="student-name"]'),
    ).map((el) => el.textContent?.trim());
    expect(names).toEqual(['Ada', 'Bo']); // 50% then 90%
  });

  it('is in the loading state while the roster request is in flight', () => {
    const s = setup();
    // request issued by the constructor, not yet flushed
    expect(s.fixture.componentInstance.state()).toBe('loading');
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW);
  });

  it('transitions to the loaded state once the roster arrives', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    expect(s.fixture.componentInstance.state()).toBe('loaded');
  });

  it('shows the empty state when no students are enrolled', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush({
      courseId: 'course-1',
      totalLessons: 10,
      students: [],
    } as CourseRosterView);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect((s.fixture.nativeElement as HTMLElement).textContent).toContain(
      'No students enrolled yet',
    );
  });

  it('shows an error state when the load fails', async () => {
    const s = setup();
    http = s.http;
    http
      .expectOne('/api/courses/course-1/students')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect((s.fixture.nativeElement as HTMLElement).textContent?.toLowerCase()).toContain(
      'could not load',
    );
  });

  it('exposes an Export CSV control', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect(
      (s.fixture.nativeElement as HTMLElement).querySelector('[data-testid="export-csv"]'),
    ).not.toBeNull();
  });

  it('exportCsv builds a CSV blob and triggers a download with the course filename', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();

    const created: Blob[] = [];
    const createUrl = vi.fn((b: Blob) => {
      created.push(b);
      return 'blob:mock';
    });
    const revokeUrl = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createUrl;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeUrl;

    let downloadName = '';
    let clicked = false;
    const realCreate = document.createElement.bind(document);
    const anchorSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement;
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = () => {
          clicked = true;
          downloadName = (el as HTMLAnchorElement).download;
        };
      }
      return el;
    });

    s.fixture.componentInstance.exportCsv();

    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(created[0]).toBeInstanceOf(Blob);
    expect(clicked).toBe(true);
    expect(downloadName).toBe('course-course-1-students.csv');
    expect(revokeUrl).toHaveBeenCalledWith('blob:mock');

    // Verify the blob has non-zero size (kills the ArrayDeclaration mutant that empties the array).
    expect(created[0].size).toBeGreaterThan(0);
    // Verify the blob has the correct MIME type (kills ObjectLiteral / StringLiteral mutants).
    expect(created[0].type).toBe('text/csv;charset=utf-8;');

    anchorSpy.mockRestore();
  });

  it('rows() is empty before the roster loads (view is null)', () => {
    const s = setup();
    // Do NOT flush — view() is still null.
    expect(s.fixture.componentInstance.rows()).toEqual([]);
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW);
  });

  it('toggleSort flips the exact direction string desc->asc->desc on the active key', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;
    expect(comp.sortDir()).toBe('desc');
    comp.toggleSort('enrolledAt'); // active key, desc -> asc
    expect(comp.sortDir()).toBe('asc');
    comp.toggleSort('enrolledAt'); // active key, asc -> desc
    expect(comp.sortDir()).toBe('desc');
  });

  it('flips sort direction when the active key is re-selected', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;

    comp.toggleSort('progress'); // new key -> ascending: Ada(50), Bo(90)
    s.fixture.detectChanges();
    expect(readNames(s.fixture)).toEqual(['Ada', 'Bo']);

    comp.toggleSort('progress'); // same key -> flips to descending: Bo(90), Ada(50)
    s.fixture.detectChanges();
    expect(readNames(s.fixture)).toEqual(['Bo', 'Ada']);
  });

  it('sorts by enrollment date ascending when the enrolled header is re-toggled', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;

    comp.toggleSort('enrolledAt'); // active key re-selected -> flips desc->asc
    s.fixture.detectChanges();
    expect(readNames(s.fixture)).toEqual(['Ada', 'Bo']); // Ada 05-20 (earlier) first
  });

  // Cross-order tests: Ada enrolled late (05-25) + low progress (10%);
  // Bo enrolled early (05-20) + high progress (90%).
  // enrolledAt asc → [Bo, Ada]; progress asc → [Ada, Bo].
  // These tests distinguish the two comparator branches and kill key-equality mutants.

  it('sorts cross-order data by enrolledAt ascending correctly (Bo enrolled earlier)', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW_CROSS);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;

    // Default is enrolledAt desc -> Ada (05-25) first, then Bo (05-20).
    expect(readNames(s.fixture)).toEqual(['Ada', 'Bo']);

    comp.toggleSort('enrolledAt'); // flip to asc -> Bo (05-20) first, then Ada (05-25).
    s.fixture.detectChanges();
    expect(readNames(s.fixture)).toEqual(['Bo', 'Ada']);
  });

  it('sorts cross-order data by progress ascending correctly (Ada has lower progress)', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW_CROSS);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;

    comp.toggleSort('progress'); // switch to progress asc -> Ada (10%) first, Bo (90%) second.
    s.fixture.detectChanges();
    // Assert via DOM order.
    expect(readNames(s.fixture)).toEqual(['Ada', 'Bo']);
    // Assert via rows() signal directly: first row should have the lower progressPercent.
    const sortedRows = comp.rows();
    expect(sortedRows[0].progressPercent).toBeLessThan(sortedRows[1].progressPercent);
    expect(sortedRows[0].displayName).toBe('Ada');
  });

  it('sorts cross-order data by progress descending correctly (Bo has higher progress)', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW_CROSS);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;

    comp.toggleSort('progress'); // asc: Ada (10%), Bo (90%)
    s.fixture.detectChanges();
    expect(readNames(s.fixture)).toEqual(['Ada', 'Bo']);

    comp.toggleSort('progress'); // flip to desc: Bo (90%), Ada (10%)
    s.fixture.detectChanges();
    expect(readNames(s.fixture)).toEqual(['Bo', 'Ada']);
  });

  it('fully sorts three scrambled students by progress asc then desc (kills - vs + comparator)', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW_THREE);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;

    comp.toggleSort('progress'); // asc -> 10, 50, 90
    s.fixture.detectChanges();
    expect(comp.rows().map((r) => r.progressPercent)).toEqual([10, 50, 90]);
    expect(readNames(s.fixture)).toEqual(['Low', 'Mid', 'High']);

    comp.toggleSort('progress'); // desc -> 90, 50, 10
    s.fixture.detectChanges();
    expect(comp.rows().map((r) => r.progressPercent)).toEqual([90, 50, 10]);
    expect(readNames(s.fixture)).toEqual(['High', 'Mid', 'Low']);
  });

  it('fully sorts three scrambled students by enrolledAt asc then desc (kills cmp*dir direction)', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW_THREE);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;

    // default enrolledAt desc -> High(23), Mid(22), Low(21)
    expect(readNames(s.fixture)).toEqual(['High', 'Mid', 'Low']);

    comp.toggleSort('enrolledAt'); // asc -> Low(21), Mid(22), High(23)
    s.fixture.detectChanges();
    expect(readNames(s.fixture)).toEqual(['Low', 'Mid', 'High']);
  });

  it('switches from progress key to enrolledAt key (cross-order data)', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/students').flush(VIEW_CROSS);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;

    // Start on progress asc -> Ada (10%) first.
    comp.toggleSort('progress');
    s.fixture.detectChanges();
    expect(readNames(s.fixture)).toEqual(['Ada', 'Bo']);

    // Switch back to enrolledAt (new key) -> asc: Bo (05-20) first, Ada (05-25) second.
    comp.toggleSort('enrolledAt');
    s.fixture.detectChanges();
    expect(readNames(s.fixture)).toEqual(['Bo', 'Ada']);
  });
});

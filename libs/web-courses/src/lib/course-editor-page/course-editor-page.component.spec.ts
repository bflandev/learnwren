import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CourseEditorPageComponent } from './course-editor-page.component';

function buildTree(): unknown {
  return {
    course: {
      id: 'cid-1',
      title: 'T',
      description: 'D',
      instructorId: 'uid-1',
      status: 'DRAFT',
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z',
    },
    modules: [
      {
        module: {
          id: 'mid-1',
          courseId: 'cid-1',
          title: 'M1',
          order: 0,
          createdAt: '2026-05-12T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
        },
        lessons: [],
      },
    ],
  };
}

describe('CourseEditorPageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CourseEditorPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(new Map([['id', 'cid-1']]) as unknown as import('@angular/router').ParamMap),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('loads the course tree on init', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    const req = http.expectOne('/api/courses/cid-1');
    expect(req.request.method).toBe('GET');
    req.flush(buildTree());
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('M1');
  });

  it('opens confirm dialog when delete module is requested', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.requestDeleteModule('mid-1');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'This will permanently remove this module',
    );
  });

  it('cancelling the confirm dialog leaves state unchanged', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();

    fixture.componentInstance.requestDeleteModule('mid-1');
    await fixture.componentInstance.onConfirmClosed(false);
    expect(fixture.componentInstance.pendingConfirm()).toBeNull();
    http.expectNone((req) => req.method === 'DELETE');
  });

  it('confirming deleteModule sends a DELETE then refreshes', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();

    fixture.componentInstance.requestDeleteModule('mid-1');
    const closing = fixture.componentInstance.onConfirmClosed(true);

    const del = http.expectOne('/api/courses/cid-1/modules/mid-1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    const refresh = http.expectOne('/api/courses/cid-1');
    refresh.flush(buildTree());
    await closing;
  });

  it('onReorderModules makes the PUT request', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();

    const pending = fixture.componentInstance.onReorderModules(['mid-1']);
    const req = http.expectOne('/api/courses/cid-1/modules/order');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ids: ['mid-1'] });
    req.flush([]);
    await pending;
  });

  it('confirming with no pending confirmation issues no request', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();

    await fixture.componentInstance.onConfirmClosed(true);
    http.expectNone((req) => req.method === 'DELETE');
  });

  it('confirming deleteCourse sends a DELETE then navigates to /courses', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();

    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);

    fixture.componentInstance.requestDeleteCourse();
    const closing = fixture.componentInstance.onConfirmClosed(true);

    const del = http.expectOne('/api/courses/cid-1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await closing;

    expect(navigate).toHaveBeenCalledWith('/courses');
    // deleteCourse returns early — it must not trigger a refresh GET.
    http.expectNone('/api/courses/cid-1');
  });

  it('confirming deleteLesson sends a DELETE then refreshes', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();

    fixture.componentInstance.requestDeleteLesson({ moduleId: 'mid-1', lessonId: 'lid-1' });
    const closing = fixture.componentInstance.onConfirmClosed(true);

    const del = http.expectOne('/api/courses/cid-1/modules/mid-1/lessons/lid-1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await closing;
  });

  it('surfaces an error message when a confirmed delete fails', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(buildTree());
    await fixture.whenStable();

    fixture.componentInstance.requestDeleteModule('mid-1');
    const closing = fixture.componentInstance.onConfirmClosed(true);

    http
      .expectOne('/api/courses/cid-1/modules/mid-1')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    await closing;

    expect(fixture.componentInstance.error()).toContain('Delete failed');
  });
});

import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Course, VideoState } from '@learnwren/shared-data-models';

import { CourseEditorPageComponent } from './course-editor-page.component';
import { CoursePublishBarComponent } from '../publish/course-publish-bar.component';
import { PublishEligibilityService } from '../publish/publish-eligibility.service';
import { NotificationsService } from '../notifications/notifications.service';

const TS = '2026-05-12T00:00:00.000Z';

function buildTree(): unknown {
  return {
    course: {
      id: 'cid-1',
      title: 'T',
      description: 'D',
      instructorId: 'uid-1',
      status: 'DRAFT',
      createdAt: TS,
      updatedAt: TS,
    },
    modules: [
      {
        module: { id: 'mid-1', courseId: 'cid-1', title: 'M1', order: 0, createdAt: TS, updatedAt: TS },
        lessons: [],
      },
    ],
  };
}

/** A two-module tree where the first module has two lessons — used to exercise reordering. */
function buildTreeWithLessons(): unknown {
  return {
    course: {
      id: 'cid-1',
      title: 'T',
      description: 'D',
      instructorId: 'uid-1',
      status: 'DRAFT',
      createdAt: TS,
      updatedAt: TS,
    },
    modules: [
      {
        module: { id: 'mid-1', courseId: 'cid-1', title: 'M1', order: 0, createdAt: TS, updatedAt: TS },
        lessons: [
          { id: 'lid-1', moduleId: 'mid-1', title: 'L1', order: 0, createdAt: TS, updatedAt: TS },
          { id: 'lid-2', moduleId: 'mid-1', title: 'L2', order: 1, createdAt: TS, updatedAt: TS },
        ],
      },
      {
        module: { id: 'mid-2', courseId: 'cid-1', title: 'M2', order: 1, createdAt: TS, updatedAt: TS },
        lessons: [],
      },
    ],
  };
}

/** Typed view of the component's `protected` members so tests can drive them directly. */
interface EditorInternals {
  onCourseUpdated(course: Course): void;
  requestPublishConfirm(kind: 'unpublish' | 'archive'): void;
  onVideoStateChanged(state: VideoState): void;
  onJumpToModule(id: string): void;
  onJumpToLesson(id: string): void;
  onCoverChanged(e: { coverImageUrl: string | undefined; updatedAt: string }): void;
  publishBar?: CoursePublishBarComponent;
}

function internals(component: CourseEditorPageComponent): EditorInternals {
  return component as unknown as EditorInternals;
}

describe('CourseEditorPageComponent', () => {
  let http: HttpTestingController;
  const notifications = { notifyModule: vi.fn() };

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
        { provide: NotificationsService, useValue: notifications },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Creates the component and resolves its initial course-tree load. */
  async function initEditor(tree: unknown = buildTree()) {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses/cid-1').flush(tree);
    await fixture.whenStable();
    return fixture;
  }

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

  it('surfaces an error when the initial course-tree load fails', async () => {
    const fixture = TestBed.createComponent(CourseEditorPageComponent);
    fixture.detectChanges();
    http
      .expectOne('/api/courses/cid-1')
      .flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(fixture.componentInstance.error()).toBe('Failed to load course.');
  });

  describe('onUpdateCourse', () => {
    it('PATCHes the course metadata then refreshes the tree', async () => {
      const fixture = await initEditor();

      const pending = fixture.componentInstance.onUpdateCourse({ title: 'Updated' });
      const patch = http.expectOne('/api/courses/cid-1');
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({ title: 'Updated' });
      patch.flush(null);
      await fixture.whenStable();

      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await pending;
      expect(fixture.componentInstance.error()).toBeNull();
    });

    it('surfaces an error and skips the refresh when the PATCH fails', async () => {
      const fixture = await initEditor();

      const pending = fixture.componentInstance.onUpdateCourse({ title: 'Updated' });
      http
        .expectOne('/api/courses/cid-1')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await pending;

      expect(fixture.componentInstance.error()).toContain('Failed to save changes');
      http.expectNone('/api/courses/cid-1');
    });
  });

  describe('addModule (inline input)', () => {
    it('does nothing when the typed title is blank', async () => {
      const fixture = await initEditor();
      fixture.componentInstance.startAddModule();
      fixture.componentInstance.newModuleTitle.set('   ');

      await fixture.componentInstance.confirmAddModule();

      http.expectNone((req) => req.method === 'POST');
      // form stays open so the user can correct the title
      expect(fixture.componentInstance.addingModule()).toBe(true);
    });

    it('POSTs the trimmed module title, refreshes, and closes the form', async () => {
      const fixture = await initEditor();
      fixture.componentInstance.startAddModule();
      fixture.componentInstance.newModuleTitle.set('  Module 2  ');

      const pending = fixture.componentInstance.confirmAddModule();
      const post = http.expectOne('/api/courses/cid-1/modules');
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ title: 'Module 2' });
      post.flush({ id: 'mid-2' });
      await fixture.whenStable();

      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await pending;
      expect(fixture.componentInstance.error()).toBeNull();
      expect(fixture.componentInstance.addingModule()).toBe(false);
      expect(fixture.componentInstance.newModuleTitle()).toBe('');
    });

    it('surfaces an error and keeps the form open when the POST fails', async () => {
      const fixture = await initEditor();
      fixture.componentInstance.startAddModule();
      fixture.componentInstance.newModuleTitle.set('Module 2');

      const pending = fixture.componentInstance.confirmAddModule();
      http
        .expectOne('/api/courses/cid-1/modules')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await pending;

      expect(fixture.componentInstance.error()).toContain('Failed to add module');
      expect(fixture.componentInstance.addingModule()).toBe(true);
      expect(fixture.componentInstance.newModuleTitle()).toBe('Module 2');
    });
  });

  describe('onRenameModule', () => {
    it('PATCHes the module title then refreshes the tree', async () => {
      const fixture = await initEditor();

      const pending = fixture.componentInstance.onRenameModule({
        moduleId: 'mid-1',
        title: 'M1 renamed',
      });
      const patch = http.expectOne('/api/courses/cid-1/modules/mid-1');
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({ title: 'M1 renamed' });
      patch.flush(null);
      await fixture.whenStable();

      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await pending;
    });

    it('surfaces an error when the rename fails', async () => {
      const fixture = await initEditor();

      const pending = fixture.componentInstance.onRenameModule({
        moduleId: 'mid-1',
        title: 'M1 renamed',
      });
      http
        .expectOne('/api/courses/cid-1/modules/mid-1')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await pending;

      expect(fixture.componentInstance.error()).toContain('Failed to rename module');
    });
  });

  describe('onAddLesson', () => {
    it('POSTs the new lesson then refreshes the tree', async () => {
      const fixture = await initEditor();

      const pending = fixture.componentInstance.onAddLesson({
        moduleId: 'mid-1',
        title: 'New lesson',
      });
      const post = http.expectOne('/api/courses/cid-1/modules/mid-1/lessons');
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ title: 'New lesson' });
      post.flush({ id: 'lid-1' });
      await fixture.whenStable();

      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await pending;
    });

    it('surfaces an error when adding a lesson fails', async () => {
      const fixture = await initEditor();

      const pending = fixture.componentInstance.onAddLesson({
        moduleId: 'mid-1',
        title: 'New lesson',
      });
      http
        .expectOne('/api/courses/cid-1/modules/mid-1/lessons')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await pending;

      expect(fixture.componentInstance.error()).toContain('Failed to add lesson');
    });
  });

  describe('onRenameLesson', () => {
    it('PATCHes the lesson title then refreshes the tree', async () => {
      const fixture = await initEditor();

      const pending = fixture.componentInstance.onRenameLesson({
        moduleId: 'mid-1',
        lessonId: 'lid-1',
        title: 'L1 renamed',
      });
      const patch = http.expectOne('/api/courses/cid-1/modules/mid-1/lessons/lid-1');
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({ title: 'L1 renamed' });
      patch.flush(null);
      await fixture.whenStable();

      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await pending;
    });

    it('surfaces an error when renaming a lesson fails', async () => {
      const fixture = await initEditor();

      const pending = fixture.componentInstance.onRenameLesson({
        moduleId: 'mid-1',
        lessonId: 'lid-1',
        title: 'L1 renamed',
      });
      http
        .expectOne('/api/courses/cid-1/modules/mid-1/lessons/lid-1')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await pending;

      expect(fixture.componentInstance.error()).toContain('Failed to rename lesson');
    });
  });

  describe('reordering', () => {
    it('onReorderModules reverts the optimistic update when the PUT fails', async () => {
      const fixture = await initEditor();

      const pending = fixture.componentInstance.onReorderModules(['mid-1']);
      http
        .expectOne('/api/courses/cid-1/modules/order')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();

      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await pending;
      expect(fixture.componentInstance.error()).toContain('Reorder failed');
    });

    it('onReorderLessons applies the new order optimistically and PUTs it', async () => {
      const fixture = await initEditor(buildTreeWithLessons());

      const pending = fixture.componentInstance.onReorderLessons({
        moduleId: 'mid-1',
        lessonIds: ['lid-2', 'lid-1'],
      });

      const moduleOne = fixture.componentInstance.tree()?.modules[0];
      expect(moduleOne?.lessons.map((l) => l.id)).toEqual(['lid-2', 'lid-1']);
      // The untouched module is left exactly as it was.
      expect(fixture.componentInstance.tree()?.modules[1].module.id).toBe('mid-2');

      const put = http.expectOne('/api/courses/cid-1/modules/mid-1/lessons/order');
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ ids: ['lid-2', 'lid-1'] });
      put.flush([]);
      await pending;
      expect(fixture.componentInstance.error()).toBeNull();
    });

    it('onReorderLessons reverts and surfaces an error when the PUT fails', async () => {
      const fixture = await initEditor(buildTreeWithLessons());

      const pending = fixture.componentInstance.onReorderLessons({
        moduleId: 'mid-1',
        lessonIds: ['lid-2', 'lid-1'],
      });
      http
        .expectOne('/api/courses/cid-1/modules/mid-1/lessons/order')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();

      http.expectOne('/api/courses/cid-1').flush(buildTreeWithLessons());
      await pending;
      expect(fixture.componentInstance.error()).toContain('Reorder failed');
    });
  });

  describe('publish transitions', () => {
    it('delegates a confirmed unpublish to the publish bar', async () => {
      const fixture = await initEditor();
      fixture.detectChanges();

      const bar = internals(fixture.componentInstance).publishBar;
      expect(bar).toBeDefined();
      const transition = vi
        .spyOn(bar as CoursePublishBarComponent, 'runConfirmedTransition')
        .mockImplementation(() => undefined);

      internals(fixture.componentInstance).requestPublishConfirm('unpublish');
      await fixture.componentInstance.onConfirmClosed(true);

      expect(transition).toHaveBeenCalledWith('unpublish');
      http.expectNone((req) => req.method === 'DELETE');
    });

    it('delegates a confirmed archive to the publish bar', async () => {
      const fixture = await initEditor();
      fixture.detectChanges();

      const bar = internals(fixture.componentInstance).publishBar;
      expect(bar).toBeDefined();
      const transition = vi
        .spyOn(bar as CoursePublishBarComponent, 'runConfirmedTransition')
        .mockImplementation(() => undefined);

      internals(fixture.componentInstance).requestPublishConfirm('archive');
      await fixture.componentInstance.onConfirmClosed(true);

      expect(transition).toHaveBeenCalledWith('archive');
    });
  });

  describe('onCourseUpdated', () => {
    it('swaps the updated course into the tree', async () => {
      const fixture = await initEditor();
      const updated: Course = {
        ...(buildTree() as { course: Course }).course,
        title: 'Renamed course',
      };

      internals(fixture.componentInstance).onCourseUpdated(updated);

      expect(fixture.componentInstance.tree()?.course.title).toBe('Renamed course');
    });

    it('re-checks publish eligibility when the course is still a draft', async () => {
      const fixture = await initEditor();
      const refresh = vi.spyOn(TestBed.inject(PublishEligibilityService), 'refresh');

      internals(fixture.componentInstance).onCourseUpdated({
        ...(buildTree() as { course: Course }).course,
        status: 'DRAFT',
      });

      expect(refresh).toHaveBeenCalled();
    });

    it('does not re-check eligibility once the course is published', async () => {
      const fixture = await initEditor();
      const refresh = vi.spyOn(TestBed.inject(PublishEligibilityService), 'refresh');

      internals(fixture.componentInstance).onCourseUpdated({
        ...(buildTree() as { course: Course }).course,
        status: 'PUBLISHED',
      });

      expect(refresh).not.toHaveBeenCalled();
    });
  });

  it('onVideoStateChanged re-checks publish eligibility', async () => {
    const fixture = await initEditor();
    const refresh = vi.spyOn(TestBed.inject(PublishEligibilityService), 'refresh');

    internals(fixture.componentInstance).onVideoStateChanged('READY');

    expect(refresh).toHaveBeenCalled();
  });

  describe('jump-to navigation', () => {
    it('onJumpToModule scrolls the matching module element into view', async () => {
      const fixture = await initEditor();
      const target = document.createElement('div');
      target.setAttribute('data-module-id', 'jump-target');
      const scrollIntoView = vi.fn();
      target.scrollIntoView = scrollIntoView;
      document.body.appendChild(target);

      try {
        internals(fixture.componentInstance).onJumpToModule('jump-target');
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
      } finally {
        target.remove();
      }
    });

    it('onJumpToModule is a no-op when no module element matches', async () => {
      const fixture = await initEditor();
      expect(() =>
        internals(fixture.componentInstance).onJumpToModule('missing'),
      ).not.toThrow();
    });

    it('onJumpToLesson scrolls the matching lesson element into view', async () => {
      const fixture = await initEditor();
      const target = document.createElement('div');
      target.setAttribute('data-lesson-id', 'jump-target');
      const scrollIntoView = vi.fn();
      target.scrollIntoView = scrollIntoView;
      document.body.appendChild(target);

      try {
        internals(fixture.componentInstance).onJumpToLesson('jump-target');
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
      } finally {
        target.remove();
      }
    });

    it('onJumpToLesson is a no-op when no lesson element matches', async () => {
      const fixture = await initEditor();
      expect(() =>
        internals(fixture.componentInstance).onJumpToLesson('missing'),
      ).not.toThrow();
    });
  });

  it('links to the students roster for the course', async () => {
    const fixture = await initEditor();
    fixture.detectChanges();
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '[data-testid="view-students"]',
    );
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toContain('/students');
  });

  it('links to the analytics page for the course', async () => {
    const fixture = await initEditor();
    fixture.detectChanges();
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '[data-testid="view-analytics"]',
    );
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toContain('/analytics');
  });

  describe('confirmMessage', () => {
    it('is empty when nothing is pending', async () => {
      const fixture = await initEditor();
      expect(fixture.componentInstance.confirmMessage()).toBe('');
    });

    it('warns that deleting a course is permanent', async () => {
      const fixture = await initEditor();
      fixture.componentInstance.requestDeleteCourse();
      expect(fixture.componentInstance.confirmMessage()).toContain(
        'Permanently delete this course',
      );
    });

    it('explains that unpublishing returns the course to draft', async () => {
      const fixture = await initEditor();
      internals(fixture.componentInstance).requestPublishConfirm('unpublish');
      expect(fixture.componentInstance.confirmMessage()).toContain('return to draft');
    });

    it('explains that archiving hides the course from the catalogue', async () => {
      const fixture = await initEditor();
      internals(fixture.componentInstance).requestPublishConfirm('archive');
      expect(fixture.componentInstance.confirmMessage()).toContain(
        'hidden from the catalogue',
      );
    });

    it('falls back to the lesson copy for a pending lesson delete', async () => {
      const fixture = await initEditor();
      fixture.componentInstance.requestDeleteLesson({ moduleId: 'mid-1', lessonId: 'lid-1' });
      expect(fixture.componentInstance.confirmMessage()).toContain('Delete this lesson');
    });
  });

  describe('onNotifyModule', () => {
    it('notifies and shows a confirmation message', async () => {
      notifications.notifyModule.mockResolvedValue({ notifiedCount: 5 });
      const fixture = await initEditor();

      const pending = fixture.componentInstance.onNotifyModule('mid-1');
      // Let the notifyModule promise settle so refresh() is called and issues the GET
      await fixture.whenStable();
      // flush the refresh GET triggered by the successful notify
      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await pending;

      expect(notifications.notifyModule).toHaveBeenCalledWith('cid-1', 'mid-1');
      expect(fixture.componentInstance.notice()).toContain('Notified 5 students');
    });

    it('uses the singular "student" when exactly one is notified', async () => {
      notifications.notifyModule.mockResolvedValue({ notifiedCount: 1 });
      const fixture = await initEditor();
      const pending = fixture.componentInstance.onNotifyModule('mid-1');
      await fixture.whenStable();
      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await pending;
      expect(fixture.componentInstance.notice()).toBe('Notified 1 student.');
    });

    it('uses the plural "students" for zero notified', async () => {
      notifications.notifyModule.mockResolvedValue({ notifiedCount: 0 });
      const fixture = await initEditor();
      const pending = fixture.componentInstance.onNotifyModule('mid-1');
      await fixture.whenStable();
      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await pending;
      expect(fixture.componentInstance.notice()).toBe('Notified 0 students.');
    });

    it('shows an error when the call fails', async () => {
      notifications.notifyModule.mockRejectedValue(new Error('boom'));
      const fixture = await initEditor();

      await fixture.componentInstance.onNotifyModule('mid-1');

      expect(fixture.componentInstance.error()).toBeTruthy();
    });
  });

  describe('nodes() projection', () => {
    it('is an empty array before the tree loads', () => {
      const fixture = TestBed.createComponent(CourseEditorPageComponent);
      fixture.detectChanges();
      // tree() is null at this point
      expect(fixture.componentInstance.nodes()).toEqual([]);
      http.expectOne('/api/courses/cid-1').flush(buildTree());
    });

    it('maps each tree module to a { module, lessons } node', async () => {
      const fixture = await initEditor(buildTreeWithLessons());
      const nodes = fixture.componentInstance.nodes();
      expect(nodes.map((n) => n.module.id)).toEqual(['mid-1', 'mid-2']);
      expect(nodes[0].lessons.map((l) => l.id)).toEqual(['lid-1', 'lid-2']);
    });
  });

  describe('refresh guard', () => {
    it('does NOT issue a GET when there is no course id in the route', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [CourseEditorPageComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: { paramMap: of(new Map()) } },
          { provide: NotificationsService, useValue: notifications },
        ],
      });
      const localHttp = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(CourseEditorPageComponent);
      fixture.detectChanges();
      localHttp.expectNone(() => true); // empty cid → refresh returns early, no request
    });
  });

  describe('onCoverChanged', () => {
    it('updates the course cover + updatedAt in the tree', async () => {
      const fixture = await initEditor();
      internals(fixture.componentInstance).onCoverChanged({
        coverImageUrl: 'https://cdn/cover.jpg',
        updatedAt: '2026-06-01T00:00:00.000Z',
      });
      const course = fixture.componentInstance.tree()?.course;
      expect(course?.coverImageUrl).toBe('https://cdn/cover.jpg');
      expect(course?.updatedAt).toBe('2026-06-01T00:00:00.000Z');
      // unrelated fields preserved
      expect(course?.title).toBe('T');
    });

    it('is a no-op when there is no tree loaded', () => {
      const fixture = TestBed.createComponent(CourseEditorPageComponent);
      fixture.detectChanges();
      // tree() null — must not throw and must leave tree null
      internals(fixture.componentInstance).onCoverChanged({
        coverImageUrl: 'x',
        updatedAt: '2026-06-01T00:00:00.000Z',
      });
      expect(fixture.componentInstance.tree()).toBeNull();
      http.expectOne('/api/courses/cid-1').flush(buildTree());
    });
  });

  describe('onCourseUpdated guard', () => {
    it('does nothing when the tree has not loaded yet', () => {
      const fixture = TestBed.createComponent(CourseEditorPageComponent);
      fixture.detectChanges();
      internals(fixture.componentInstance).onCourseUpdated({
        ...(buildTree() as { course: Course }).course,
        title: 'X',
      });
      expect(fixture.componentInstance.tree()).toBeNull();
      http.expectOne('/api/courses/cid-1').flush(buildTree());
    });
  });

  describe('add-module form lifecycle', () => {
    it('starts collapsed with an empty title', async () => {
      const fixture = await initEditor();
      expect(fixture.componentInstance.addingModule()).toBe(false);
      expect(fixture.componentInstance.newModuleTitle()).toBe('');
    });

    it('startAddModule opens the form with a cleared title', async () => {
      const fixture = await initEditor();
      fixture.componentInstance.newModuleTitle.set('stale');
      fixture.componentInstance.startAddModule();
      expect(fixture.componentInstance.addingModule()).toBe(true);
      expect(fixture.componentInstance.newModuleTitle()).toBe('');
    });

    it('cancelAddModule closes the form and clears the typed title', async () => {
      const fixture = await initEditor();
      fixture.componentInstance.startAddModule();
      fixture.componentInstance.newModuleTitle.set('typed something');
      fixture.componentInstance.cancelAddModule();
      expect(fixture.componentInstance.addingModule()).toBe(false);
      expect(fixture.componentInstance.newModuleTitle()).toBe('');
    });
  });

  describe('reorder projection details', () => {
    it('onReorderModules reorders modules by the given id order (optimistic)', async () => {
      const fixture = await initEditor(buildTreeWithLessons());
      const pending = fixture.componentInstance.onReorderModules(['mid-2', 'mid-1']);
      // optimistic local order is applied immediately
      expect(fixture.componentInstance.tree()?.modules.map((n) => n.module.id)).toEqual([
        'mid-2',
        'mid-1',
      ]);
      // lessons of the moved modules are carried along
      const reordered = fixture.componentInstance.tree()?.modules;
      expect(reordered?.[1].lessons.map((l) => l.id)).toEqual(['lid-1', 'lid-2']);
      http.expectOne('/api/courses/cid-1/modules/order').flush([]);
      await pending;
    });

    it('onReorderModules drops ids that are not present in the tree', async () => {
      const fixture = await initEditor(buildTreeWithLessons());
      const pending = fixture.componentInstance.onReorderModules(['mid-2', 'ghost', 'mid-1']);
      // 'ghost' has no matching module and is filtered out
      expect(fixture.componentInstance.tree()?.modules.map((n) => n.module.id)).toEqual([
        'mid-2',
        'mid-1',
      ]);
      http.expectOne('/api/courses/cid-1/modules/order').flush([]);
      await pending;
    });

    it('onReorderLessons leaves OTHER modules (and their lessons) untouched and drops unknown lesson ids', async () => {
      // mid-2 has its OWN lessons so an over-eager projection that reorders ALL
      // modules with mid-1's lessonIds would wipe mid-2's lessons to [].
      const treeBothPopulated = {
        course: (buildTreeWithLessons() as { course: unknown }).course,
        modules: [
          (buildTreeWithLessons() as { modules: unknown[] }).modules[0],
          {
            module: { id: 'mid-2', courseId: 'cid-1', title: 'M2', order: 1, createdAt: TS, updatedAt: TS },
            lessons: [
              { id: 'lid-9', moduleId: 'mid-2', title: 'L9', order: 0, createdAt: TS, updatedAt: TS },
            ],
          },
        ],
      };
      const fixture = await initEditor(treeBothPopulated);
      const pending = fixture.componentInstance.onReorderLessons({
        moduleId: 'mid-1',
        lessonIds: ['lid-2', 'ghost', 'lid-1'],
      });
      const modules = fixture.componentInstance.tree()?.modules;
      // target module reordered, ghost filtered out
      expect(modules?.[0].lessons.map((l) => l.id)).toEqual(['lid-2', 'lid-1']);
      // the OTHER module is returned untouched — its own lesson survives intact
      expect(modules?.[1].module.id).toBe('mid-2');
      expect(modules?.[1].lessons.map((l) => l.id)).toEqual(['lid-9']);
      http.expectOne('/api/courses/cid-1/modules/mid-1/lessons/order').flush([]);
      await pending;
    });

    it('onReorderModules is a no-op (no PUT) when the tree has not loaded', () => {
      const fixture = TestBed.createComponent(CourseEditorPageComponent);
      fixture.detectChanges();
      // snapshot is null → runOptimisticReorder returns early
      void fixture.componentInstance.onReorderModules(['mid-1']);
      http.expectOne('/api/courses/cid-1').flush(buildTree());
      http.expectNone('/api/courses/cid-1/modules/order');
    });
  });

  describe('confirm delegation guards', () => {
    it('onConfirmClosed does not throw delegating a publish transition when no publish bar exists', async () => {
      // Build without resolving the tree so the publish bar (rendered only when a
      // course exists) is absent, exercising the optional chain publishBar?.…
      const fixture = TestBed.createComponent(CourseEditorPageComponent);
      fixture.detectChanges();
      http.expectOne('/api/courses/cid-1').flush({}, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      internals(fixture.componentInstance).requestPublishConfirm('unpublish');
      await expect(fixture.componentInstance.onConfirmClosed(true)).resolves.toBeUndefined();
    });
  });

  describe('error banner lifecycle', () => {
    it('clears a previous error banner when a later operation succeeds', async () => {
      const fixture = await initEditor();

      // First operation fails and pins the banner.
      const failing = fixture.componentInstance.onRenameModule({ moduleId: 'mid-1', title: 'X' });
      http
        .expectOne('/api/courses/cid-1/modules/mid-1')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await failing;
      expect(fixture.componentInstance.error()).toContain('Failed to rename module');

      // A later successful operation must clear the stale banner.
      const succeeding = fixture.componentInstance.onRenameModule({ moduleId: 'mid-1', title: 'Y' });
      http.expectOne('/api/courses/cid-1/modules/mid-1').flush(null);
      await fixture.whenStable();
      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await succeeding;
      expect(fixture.componentInstance.error()).toBeNull();
    });

    it('clears a previous error banner when a confirmed delete succeeds', async () => {
      const fixture = await initEditor();
      fixture.componentInstance.error.set('stale error');

      fixture.componentInstance.requestDeleteModule('mid-1');
      const closing = fixture.componentInstance.onConfirmClosed(true);
      http
        .expectOne('/api/courses/cid-1/modules/mid-1')
        .flush(null, { status: 204, statusText: 'No Content' });
      await fixture.whenStable();
      http.expectOne('/api/courses/cid-1').flush(buildTree());
      await closing;
      expect(fixture.componentInstance.error()).toBeNull();
    });

    it('clears a previous error banner when a reorder succeeds', async () => {
      const fixture = await initEditor();
      fixture.componentInstance.error.set('stale error');

      const pending = fixture.componentInstance.onReorderModules(['mid-1']);
      expect(fixture.componentInstance.error()).toBeNull();
      http.expectOne('/api/courses/cid-1/modules/order').flush([]);
      await pending;
      expect(fixture.componentInstance.error()).toBeNull();
    });
  });

  describe('route param change (component reuse on back/forward)', () => {
    /** Tree payload whose course id/title match the given cid. */
    function treeFor(cid: string): unknown {
      const t = buildTree() as { course: Course; modules: unknown[] };
      return { ...t, course: { ...t.course, id: cid, title: `Course ${cid}` } };
    }

    function setupWithParams() {
      TestBed.resetTestingModule();
      const params$ = new Subject<Map<string, string>>();
      TestBed.configureTestingModule({
        imports: [CourseEditorPageComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: { paramMap: params$.asObservable() } },
          { provide: NotificationsService, useValue: notifications },
        ],
      });
      return { params$, http: TestBed.inject(HttpTestingController) };
    }

    it('reloads the tree and resets transient state when the :id param changes', async () => {
      const { params$, http: localHttp } = setupWithParams();
      const fixture = TestBed.createComponent(CourseEditorPageComponent);
      fixture.detectChanges();

      params$.next(new Map([['id', 'cid-1']]));
      localHttp.expectOne('/api/courses/cid-1').flush(treeFor('cid-1'));
      await fixture.whenStable();
      expect(fixture.componentInstance.tree()?.course.id).toBe('cid-1');

      // Dirty every piece of per-course transient state.
      fixture.componentInstance.error.set('old error');
      fixture.componentInstance.notice.set('old notice');
      fixture.componentInstance.requestDeleteCourse();
      fixture.componentInstance.startAddModule();
      fixture.componentInstance.newModuleTitle.set('typed');

      // Browser back/forward to another course reuses the component instance.
      params$.next(new Map([['id', 'cid-2']]));
      const req = localHttp.expectOne('/api/courses/cid-2');
      expect(fixture.componentInstance.tree()).toBeNull();
      expect(fixture.componentInstance.error()).toBeNull();
      expect(fixture.componentInstance.notice()).toBeNull();
      expect(fixture.componentInstance.pendingConfirm()).toBeNull();
      expect(fixture.componentInstance.addingModule()).toBe(false);
      expect(fixture.componentInstance.newModuleTitle()).toBe('');

      req.flush(treeFor('cid-2'));
      await fixture.whenStable();
      expect(fixture.componentInstance.tree()?.course.id).toBe('cid-2');
      expect(fixture.componentInstance.cid()).toBe('cid-2');
    });

    it('discards an in-flight response for the previous course id', async () => {
      const { params$, http: localHttp } = setupWithParams();
      const fixture = TestBed.createComponent(CourseEditorPageComponent);
      fixture.detectChanges();

      params$.next(new Map([['id', 'cid-1']]));
      const reqA = localHttp.expectOne('/api/courses/cid-1'); // slow — not flushed yet

      params$.next(new Map([['id', 'cid-2']]));
      const reqB = localHttp.expectOne('/api/courses/cid-2');
      reqB.flush(treeFor('cid-2'));
      await fixture.whenStable();

      // A's response lands late — it must be discarded, not rendered.
      reqA.flush(treeFor('cid-1'));
      await fixture.whenStable();
      expect(fixture.componentInstance.tree()?.course.id).toBe('cid-2');
    });

    it('discards a late error from the previous course id', async () => {
      const { params$, http: localHttp } = setupWithParams();
      const fixture = TestBed.createComponent(CourseEditorPageComponent);
      fixture.detectChanges();

      params$.next(new Map([['id', 'cid-1']]));
      const reqA = localHttp.expectOne('/api/courses/cid-1');

      params$.next(new Map([['id', 'cid-2']]));
      localHttp.expectOne('/api/courses/cid-2').flush(treeFor('cid-2'));
      await fixture.whenStable();

      reqA.flush({}, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      expect(fixture.componentInstance.error()).toBeNull();
    });
  });

  it('requestDeleteLesson stores a deleteLesson pending confirmation with the ids', async () => {
    const fixture = await initEditor(buildTreeWithLessons());
    fixture.componentInstance.requestDeleteLesson({ moduleId: 'mid-1', lessonId: 'lid-1' });
    expect(fixture.componentInstance.pendingConfirm()).toEqual({
      kind: 'deleteLesson',
      moduleId: 'mid-1',
      lessonId: 'lid-1',
    });
  });
});

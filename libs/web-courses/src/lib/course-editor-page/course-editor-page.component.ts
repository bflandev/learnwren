import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import type { Course, CourseId, ISODateString, Lesson, LessonId, Module, ModuleId, VideoState } from '@learnwren/shared-data-models';
import { MODULE_TITLE_MAX_LENGTH } from '@learnwren/shared-data-models';

import { CourseMetaPanelComponent } from '../components/course-meta-panel/course-meta-panel.component';
import { ModuleTreeComponent, type ModuleNode } from '../components/module-tree/module-tree.component';
import { CourseCoverUploaderComponent } from '../cover/course-cover-uploader.component';
import { CoursesService, type CourseTree, type UpdateCourseInput } from '../courses.service';
import { CoursePublishBarComponent } from '../publish/course-publish-bar.component';
import { PublishEligibilityPanelComponent } from '../publish/publish-eligibility-panel.component';
import { PublishEligibilityService } from '../publish/publish-eligibility.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ConfirmDialogService,
  HlmAlert,
  HlmButton,
  HlmInput,
  HlmSkeleton,
  type ConfirmDialogConfig,
} from '@learnwren/web-ui';

type PendingConfirm =
  | { kind: 'deleteCourse' }
  | { kind: 'deleteModule'; moduleId: string }
  | { kind: 'deleteLesson'; moduleId: string; lessonId: string }
  | { kind: 'unpublish' }
  | { kind: 'archive' };

// Dialog copy per confirmable action. Deletes are irreversible → destructive
// accept button; unpublish/archive are reversible transitions → default.
const CONFIRM_COPY: Record<PendingConfirm['kind'], ConfirmDialogConfig> = {
  deleteCourse: {
    header: 'Delete course',
    message:
      'Permanently delete this course and all its modules and lessons. This action cannot be undone.',
    acceptLabel: 'Delete',
    variant: 'destructive',
  },
  deleteModule: {
    header: 'Delete module',
    message:
      'This will permanently remove this module and all its lessons. This action cannot be undone.',
    acceptLabel: 'Delete',
    variant: 'destructive',
  },
  deleteLesson: {
    header: 'Delete lesson',
    message: 'Delete this lesson? This action cannot be undone.',
    acceptLabel: 'Delete',
    variant: 'destructive',
  },
  unpublish: {
    header: 'Unpublish course',
    message:
      'The course will return to draft and leave the catalogue. Enrolled students lose access to its lessons, videos and materials until you publish it again.',
    acceptLabel: 'Unpublish',
  },
  archive: {
    header: 'Archive course',
    message:
      'Archived courses are hidden from the catalogue, and enrolled students lose access to them. You can restore the course to draft at any time.',
    acceptLabel: 'Archive',
  },
};

const HTTP_GATEWAY_TIMEOUT = 504;

@Component({
  selector: 'lib-course-editor-page',
  standalone: true,
  imports: [RouterLink, CourseMetaPanelComponent, ModuleTreeComponent, CoursePublishBarComponent, PublishEligibilityPanelComponent, CourseCoverUploaderComponent, HlmAlert, HlmButton, HlmInput, HlmSkeleton],
  templateUrl: './course-editor-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseEditorPageComponent {
  protected readonly moduleTitleMax = MODULE_TITLE_MAX_LENGTH;
  private readonly service = inject(CoursesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly publishSvc = inject(PublishEligibilityService);
  private readonly notifications = inject(NotificationsService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly paramMap = toSignal(this.route.paramMap);
  readonly cid = computed(() => (this.paramMap()?.get('id') ?? '') as CourseId);
  readonly tree = signal<CourseTree | null>(null);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly pendingConfirm = signal<PendingConfirm | null>(null);

  @ViewChild(CoursePublishBarComponent) protected publishBar?: CoursePublishBarComponent;

  readonly nodes = computed<ModuleNode[]>(() =>
    (this.tree()?.modules ?? []).map((m) => ({ module: m.module, lessons: m.lessons })),
  );

  /**
   * Monotonic token identifying the most recent refresh(). getCourseTree is a
   * non-cancellable Promise, so a slow response for a previous course can
   * resolve AFTER the route has moved to another course (browser back/forward
   * reuses this component instance). Stale results are discarded.
   */
  private loadToken = 0;

  constructor() {
    // Angular reuses the component instance when only the :id param changes
    // (browser back/forward between two courses), so reload on every emission
    // and drop the previous course's transient state.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => {
      this.resetCourseState();
      void this.refresh();
    });
  }

  /** Drop per-course transient state when the route moves to another course. */
  private resetCourseState(): void {
    this.tree.set(null);
    this.error.set(null);
    this.notice.set(null);
    this.pendingConfirm.set(null);
    this.addingModule.set(false);
    this.newModuleTitle.set('');
  }

  // Reorder queue state — see runOptimisticReorder.
  private reorderTail: Promise<void> | undefined;
  private reordersQueued = 0;
  private reorderGeneration = 0;
  private refreshAfterReorders = false;
  private loadsInFlight = 0;

  async refresh(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    const token = ++this.loadToken;
    this.loadsInFlight++;
    try {
      const tree = await this.service.getCourseTree(cid);
      if (token !== this.loadToken) return; // superseded by a newer load
      this.tree.set(tree);
      this.publishSvc.bindToCourse(cid);
      this.publishSvc.refresh();
    } catch {
      if (token !== this.loadToken) return; // superseded by a newer load
      this.notice.set(null);
      this.error.set('Failed to load course.');
    } finally {
      this.loadsInFlight--;
    }
  }

  async onUpdateCourse(patch: UpdateCourseInput): Promise<void> {
    await this.runWithErrorMessage(
      () => this.service.updateCourse(this.cid(), patch),
      'Failed to save changes — refresh to see current state.',
    );
  }

  requestDeleteCourse(): void {
    this.openConfirm({ kind: 'deleteCourse' });
  }

  requestDeleteModule(moduleId: string): void {
    this.openConfirm({ kind: 'deleteModule', moduleId });
  }

  requestDeleteLesson(args: { moduleId: string; lessonId: string }): void {
    this.openConfirm({ kind: 'deleteLesson', ...args });
  }

  /**
   * Record which action awaits confirmation, then route the shared confirm
   * dialog's outcome into onConfirmClosed. pendingConfirm is consumed exactly
   * once there, so a stale resolution (route change already cleared it) no-ops.
   */
  private openConfirm(pending: PendingConfirm): void {
    this.pendingConfirm.set(pending);
    void this.confirmDialog
      .confirm(CONFIRM_COPY[pending.kind])
      .then((confirmed) => this.onConfirmClosed(confirmed));
  }

  protected onCourseUpdated(updated: Course): void {
    const t = this.tree();
    if (t) this.tree.set({ ...t, course: updated });
    if (updated.status === 'DRAFT') this.publishSvc.refresh();
  }

  onCoverChanged(e: { coverImageUrl: string | undefined; updatedAt: ISODateString }): void {
    const t = this.tree();
    if (!t) return;
    this.tree.set({
      ...t,
      course: { ...t.course, coverImageUrl: e.coverImageUrl, updatedAt: e.updatedAt },
    });
  }

  protected requestPublishConfirm(kind: 'unpublish' | 'archive'): void {
    this.openConfirm({ kind });
  }

  protected onVideoStateChanged(_state: VideoState): void {
    this.publishSvc.refresh();
  }

  protected onJumpToModule(mid: ModuleId): void {
    this.smoothScrollTo(`[data-module-id="${mid}"]`);
  }

  protected onJumpToLesson(lid: LessonId): void {
    this.smoothScrollTo(`[data-lesson-id="${lid}"]`);
  }

  private smoothScrollTo(selector: string): void {
    const el = document.querySelector(selector);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async onConfirmClosed(confirmed: boolean): Promise<void> {
    const pending = this.pendingConfirm();
    this.pendingConfirm.set(null);
    if (!confirmed || !pending) return;
    if (pending.kind === 'unpublish' || pending.kind === 'archive') {
      this.publishBar?.runConfirmedTransition(pending.kind);
      return;
    }
    this.error.set(null);
    this.notice.set(null);
    try {
      if (pending.kind === 'deleteCourse') {
        await this.service.deleteCourse(this.cid());
        await this.router.navigateByUrl('/courses');
        return;
      }
      if (pending.kind === 'deleteModule') {
        await this.service.deleteModule(this.cid(), pending.moduleId);
      } else {
        await this.service.deleteLesson(this.cid(), pending.moduleId, pending.lessonId);
      }
      await this.refresh();
    } catch {
      this.notice.set(null);
      this.error.set('Delete failed — refresh to see current state.');
    }
  }

  readonly addingModule = signal(false);
  readonly newModuleTitle = signal('');

  startAddModule(): void {
    this.newModuleTitle.set('');
    this.addingModule.set(true);
  }

  cancelAddModule(): void {
    this.addingModule.set(false);
    this.newModuleTitle.set('');
  }

  async confirmAddModule(): Promise<void> {
    const title = this.newModuleTitle().trim();
    if (!title) return;
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.service.createModule(this.cid(), { title });
      // Reset only on success; on failure keep the form open with the typed
      // title so the instructor can retry. Replaces the inaccessible window.prompt.
      this.addingModule.set(false);
      this.newModuleTitle.set('');
      await this.refresh();
    } catch {
      this.error.set('Failed to add module.');
    }
  }

  async onRenameModule(args: { moduleId: string; title: string }): Promise<void> {
    await this.runWithErrorMessage(
      () => this.service.updateModule(this.cid(), args.moduleId, { title: args.title }),
      'Failed to rename module.',
    );
  }

  async onAddLesson(args: { moduleId: string; title: string }): Promise<void> {
    await this.runWithErrorMessage(
      () => this.service.createLesson(this.cid(), args.moduleId, { title: args.title }),
      'Failed to add lesson.',
    );
  }

  async onRenameLesson(args: { moduleId: string; lessonId: string; title: string }): Promise<void> {
    await this.runWithErrorMessage(
      () => this.service.updateLesson(this.cid(), args.moduleId, args.lessonId, { title: args.title }),
      'Failed to rename lesson.',
    );
  }

  async onNotifyModule(moduleId: string): Promise<void> {
    // A send can take up to a minute; a second click would 409
    // (MODULE_ALREADY_NOTIFIED) and pin an error beside the success notice.
    if (this.notifyingModules.has(moduleId)) return;
    this.notifyingModules.add(moduleId);
    try {
      await this.notifyModule(moduleId);
    } finally {
      this.notifyingModules.delete(moduleId);
    }
  }

  private readonly notifyingModules = new Set<string>();

  private async notifyModule(moduleId: string): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    try {
      const { notifiedCount } = await this.notifications.notifyModule(this.cid(), moduleId);
      this.notice.set(`Notified ${notifiedCount} student${notifiedCount === 1 ? '' : 's'}.`);
      await this.refresh();
    } catch (err) {
      // The hosting proxy gives up on a request after 60 s, but the server
      // keeps sending (and has already marked the module notified), so a
      // large class reads as a failure that cannot be retried. Say so.
      if (err instanceof HttpErrorResponse && err.status === HTTP_GATEWAY_TIMEOUT) {
        await this.refresh();
        // Only a stamped module proves the server got as far as sending.
        if (this.isNotified(moduleId)) {
          this.notice.set('Emails are still being sent to your students. This can take a few minutes for a large class.');
          return;
        }
      }
      this.error.set('Failed to notify students.');
    }
  }

  private isNotified(moduleId: string): boolean {
    return this.tree()?.modules.some((m) => m.module.id === moduleId && m.module.studentsNotifiedAt != null) ?? false;
  }

  async onReorderModules(ids: string[]): Promise<void> {
    await this.runOptimisticReorder(
      (snapshot) => ({
        course: snapshot.course,
        modules: ids
          .map((id) => snapshot.modules.find((n) => n.module.id === id))
          .filter((n): n is { module: Module; lessons: Lesson[] } => Boolean(n)),
      }),
      (cid) => this.service.reorderModules(cid, ids),
    );
  }

  async onReorderLessons(args: { moduleId: string; lessonIds: string[] }): Promise<void> {
    await this.runOptimisticReorder(
      (snapshot) => ({
        course: snapshot.course,
        modules: snapshot.modules.map((n) => {
          if (n.module.id !== args.moduleId) return n;
          const newLessons = args.lessonIds
            .map((id) => n.lessons.find((l) => l.id === id))
            .filter((l): l is Lesson => Boolean(l));
          return { module: n.module, lessons: newLessons };
        }),
      }),
      (cid) => this.service.reorderLessons(cid, args.moduleId, args.lessonIds),
    );
  }

  /**
   * Apply an optimistic local tree mutation, then commit it via `commit`.
   * Moves are queued so they reach the server in click order (an earlier PUT
   * committing last would leave the intermediate order). A tree load in flight
   * is superseded — it would paint the old order back — and re-run once the
   * queue drains. A failed move reverts, pins "Reorder failed — reverted.",
   * and drops the moves queued behind it (their id lists assume it landed);
   * the drain refresh then shows the server's order.
   */
  private runOptimisticReorder(
    project: (snapshot: CourseTree) => CourseTree,
    commit: (cid: string) => Promise<unknown>,
  ): Promise<void> {
    const snapshot = this.tree();
    if (!snapshot) return Promise.resolve();
    const cid = this.cid();
    const generation = this.reorderGeneration;
    if (this.loadsInFlight > 0) this.refreshAfterReorders = true;
    ++this.loadToken;
    this.error.set(null);
    this.notice.set(null);
    this.tree.set(project(snapshot));
    this.reordersQueued++;
    const go = async (): Promise<void> => {
      try {
        // Skip a move queued behind a failure, or one for a course no longer shown.
        if (generation !== this.reorderGeneration || cid !== this.cid()) return;
        try {
          await commit(cid);
        } catch {
          this.reorderGeneration++;
          this.refreshAfterReorders = true;
          this.tree.set(snapshot);
          this.notice.set(null);
          this.error.set('Reorder failed — reverted.');
        }
      } finally {
        if (--this.reordersQueued === 0 && this.refreshAfterReorders) {
          this.refreshAfterReorders = false;
          await this.refresh();
        }
      }
    };
    const run = this.reorderTail ? this.reorderTail.then(go) : go();
    this.reorderTail = run;
    void run.finally(() => {
      if (this.reorderTail === run) this.reorderTail = undefined;
    });
    return run;
  }

  /**
   * Run a service call, refresh on success, and pin the given error message
   * on failure. The mutating-success path always re-fetches the tree so the
   * UI matches the server's view rather than relying on a local projection.
   */
  private async runWithErrorMessage(op: () => Promise<unknown>, errorMessage: string): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    try {
      await op();
      await this.refresh();
    } catch {
      this.notice.set(null);
      this.error.set(errorMessage);
    }
  }

}

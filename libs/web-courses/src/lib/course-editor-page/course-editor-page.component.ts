import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import type { Course, CourseId, Lesson, LessonId, Module, ModuleId, VideoState } from '@learnwren/shared-data-models';

import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { CourseMetaPanelComponent } from '../components/course-meta-panel/course-meta-panel.component';
import { ModuleTreeComponent, type ModuleNode } from '../components/module-tree/module-tree.component';
import { CoursesService, type CourseTree, type UpdateCourseInput } from '../courses.service';
import { CoursePublishBarComponent } from '../publish/course-publish-bar.component';
import { PublishEligibilityPanelComponent } from '../publish/publish-eligibility-panel.component';
import { PublishEligibilityService } from '../publish/publish-eligibility.service';

type PendingConfirm =
  | { kind: 'deleteCourse' }
  | { kind: 'deleteModule'; moduleId: string }
  | { kind: 'deleteLesson'; moduleId: string; lessonId: string }
  | { kind: 'unpublish' }
  | { kind: 'archive' };

@Component({
  selector: 'lib-course-editor-page',
  standalone: true,
  imports: [RouterLink, CourseMetaPanelComponent, ModuleTreeComponent, ConfirmDialogComponent, CoursePublishBarComponent, PublishEligibilityPanelComponent],
  templateUrl: './course-editor-page.component.html',
})
export class CourseEditorPageComponent {
  private readonly service = inject(CoursesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly publishSvc = inject(PublishEligibilityService);

  private readonly paramMap = toSignal(this.route.paramMap);
  readonly cid = computed(() => (this.paramMap()?.get('id') ?? '') as CourseId);
  readonly tree = signal<CourseTree | null>(null);
  readonly error = signal<string | null>(null);
  readonly pendingConfirm = signal<PendingConfirm | null>(null);

  @ViewChild(CoursePublishBarComponent) protected publishBar?: CoursePublishBarComponent;

  readonly nodes = computed<ModuleNode[]>(() =>
    (this.tree()?.modules ?? []).map((m) => ({ module: m.module, lessons: m.lessons })),
  );

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    try {
      const tree = await this.service.getCourseTree(cid);
      this.tree.set(tree);
      this.publishSvc.bindToCourse(cid);
      this.publishSvc.refresh();
    } catch {
      this.error.set('Failed to load course.');
    }
  }

  async onUpdateCourse(patch: UpdateCourseInput): Promise<void> {
    try {
      await this.service.updateCourse(this.cid(), patch);
      await this.refresh();
    } catch {
      this.error.set('Failed to save changes — refresh to see current state.');
    }
  }

  requestDeleteCourse(): void {
    this.pendingConfirm.set({ kind: 'deleteCourse' });
  }

  requestDeleteModule(moduleId: string): void {
    this.pendingConfirm.set({ kind: 'deleteModule', moduleId });
  }

  requestDeleteLesson(args: { moduleId: string; lessonId: string }): void {
    this.pendingConfirm.set({ kind: 'deleteLesson', ...args });
  }

  protected onCourseUpdated(updated: Course): void {
    const t = this.tree();
    if (t) this.tree.set({ ...t, course: updated });
    if (updated.status === 'DRAFT') this.publishSvc.refresh();
  }

  protected requestPublishConfirm(kind: 'unpublish' | 'archive'): void {
    this.pendingConfirm.set({ kind });
  }

  protected onVideoStateChanged(_state: VideoState): void {
    this.publishSvc.refresh();
  }

  protected onJumpToModule(mid: ModuleId): void {
    const el = document.querySelector(`[data-module-id="${mid}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  protected onJumpToLesson(lid: LessonId): void {
    const el = document.querySelector(`[data-lesson-id="${lid}"]`);
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
      this.error.set('Delete failed — refresh to see current state.');
    }
  }

  async addModule(): Promise<void> {
    const title = window.prompt('Module title');
    if (!title) return;
    try {
      await this.service.createModule(this.cid(), { title });
      await this.refresh();
    } catch {
      this.error.set('Failed to add module.');
    }
  }

  async onRenameModule(args: { moduleId: string; title: string }): Promise<void> {
    try {
      await this.service.updateModule(this.cid(), args.moduleId, { title: args.title });
      await this.refresh();
    } catch {
      this.error.set('Failed to rename module.');
    }
  }

  async onAddLesson(args: { moduleId: string; title: string }): Promise<void> {
    try {
      await this.service.createLesson(this.cid(), args.moduleId, { title: args.title });
      await this.refresh();
    } catch {
      this.error.set('Failed to add lesson.');
    }
  }

  async onRenameLesson(args: { moduleId: string; lessonId: string; title: string }): Promise<void> {
    try {
      await this.service.updateLesson(this.cid(), args.moduleId, args.lessonId, {
        title: args.title,
      });
      await this.refresh();
    } catch {
      this.error.set('Failed to rename lesson.');
    }
  }

  async onReorderModules(ids: string[]): Promise<void> {
    const snapshot = this.tree();
    if (!snapshot) return;
    this.tree.set({
      course: snapshot.course,
      modules: ids
        .map((id) => snapshot.modules.find((n) => n.module.id === id))
        .filter((n): n is { module: Module; lessons: Lesson[] } => Boolean(n)),
    });
    try {
      await this.service.reorderModules(this.cid(), ids);
    } catch {
      this.tree.set(snapshot);
      this.error.set('Reorder failed — reverted.');
      await this.refresh();
    }
  }

  async onReorderLessons(args: { moduleId: string; lessonIds: string[] }): Promise<void> {
    const snapshot = this.tree();
    if (!snapshot) return;
    this.tree.set({
      course: snapshot.course,
      modules: snapshot.modules.map((n) => {
        if (n.module.id !== args.moduleId) return n;
        const newLessons = args.lessonIds
          .map((id) => n.lessons.find((l) => l.id === id))
          .filter((l): l is Lesson => Boolean(l));
        return { module: n.module, lessons: newLessons };
      }),
    });
    try {
      await this.service.reorderLessons(this.cid(), args.moduleId, args.lessonIds);
    } catch {
      this.tree.set(snapshot);
      this.error.set('Reorder failed — reverted.');
      await this.refresh();
    }
  }

  confirmMessage(): string {
    const p = this.pendingConfirm();
    if (!p) return '';
    if (p.kind === 'deleteCourse')
      return 'Permanently delete this course and all its modules and lessons. This action cannot be undone.';
    if (p.kind === 'deleteModule')
      return 'This will permanently remove this module and all its lessons. This action cannot be undone.';
    if (p.kind === 'unpublish')
      return 'The course will return to draft. Once a student catalogue exists, the course will no longer be discoverable. Existing enrolled students would retain access.';
    if (p.kind === 'archive')
      return 'Archived courses are hidden from the catalogue. You can restore the course to draft at any time.';
    return 'Delete this lesson? This action cannot be undone.';
  }
}

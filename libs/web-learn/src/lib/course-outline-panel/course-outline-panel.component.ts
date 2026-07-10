import { ChangeDetectionStrategy, Component, HostListener, computed, input, output, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';

import type { CourseId, CourseOutline, LessonId } from '@learnwren/shared-data-models';

export type CourseOutlinePanelMode = 'sidebar' | 'drawer';

@Component({
  selector: 'lib-course-outline-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule],
  templateUrl: './course-outline-panel.component.html',
})
export class CourseOutlinePanelComponent {
  readonly outline = input.required<CourseOutline>();
  readonly activeLessonId = input.required<LessonId>();
  readonly courseId = input.required<CourseId>();
  readonly mode = input.required<CourseOutlinePanelMode>();
  readonly outlineOpen = input<boolean>(true);

  readonly lessonSelected = output<LessonId>();
  readonly outlineOpenChange = output<boolean>();

  readonly processingNoticeFor = signal<LessonId | null>(null);

  /** True when the module's every lesson is complete (US-06-02 module rollup). */
  isModuleComplete(m: CourseOutline['modules'][number]): boolean {
    return m.lessons.length > 0 && m.lessons.every((l) => l.completedAt != null);
  }

  readonly courseComplete = computed(() => {
    const lessons = this.outline().modules.flatMap((m) => m.lessons);
    return lessons.length > 0 && lessons.every((l) => l.completedAt != null);
  });

  onRowClick(lessonId: LessonId, videoState: string | null): void {
    if (lessonId === this.activeLessonId()) return;
    if (videoState !== 'READY') {
      this.processingNoticeFor.set(lessonId);
      return;
    }
    this.processingNoticeFor.set(null);
    this.lessonSelected.emit(lessonId);
    if (this.mode() === 'drawer') {
      this.outlineOpenChange.emit(false);
    }
  }

  onBackdropClick(): void {
    if (this.mode() === 'drawer') this.outlineOpenChange.emit(false);
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (this.mode() === 'drawer' && this.outlineOpen()) {
      this.outlineOpenChange.emit(false);
    }
  }
}

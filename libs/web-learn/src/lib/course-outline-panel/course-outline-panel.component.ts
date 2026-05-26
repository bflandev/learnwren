import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';

import type { CourseId, CourseOutline, LessonId } from '@learnwren/shared-data-models';

export type CourseOutlinePanelMode = 'sidebar' | 'drawer';

@Component({
  selector: 'lib-course-outline-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-outline-panel.component.html',
})
export class CourseOutlinePanelComponent {
  @Input({ required: true }) outline!: CourseOutline;
  @Input({ required: true }) activeLessonId!: LessonId;
  @Input({ required: true }) courseId!: CourseId;
  @Input({ required: true }) mode!: CourseOutlinePanelMode;
  @Input() outlineOpen = true;

  @Output() readonly lessonSelected = new EventEmitter<LessonId>();
  @Output() readonly outlineOpenChange = new EventEmitter<boolean>();

  readonly processingNoticeFor = signal<LessonId | null>(null);

  onRowClick(lessonId: LessonId, videoState: string | null): void {
    if (lessonId === this.activeLessonId) return;
    if (videoState !== 'READY') {
      this.processingNoticeFor.set(lessonId);
      return;
    }
    this.processingNoticeFor.set(null);
    this.lessonSelected.emit(lessonId);
  }
}

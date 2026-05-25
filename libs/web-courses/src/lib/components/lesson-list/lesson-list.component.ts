import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { CourseId, Lesson, VideoState } from '@learnwren/shared-data-models';

import { LessonItemComponent } from '../lesson-item/lesson-item.component';

@Component({
  selector: 'lib-lesson-list',
  standalone: true,
  imports: [CdkDropList, CdkDrag, LessonItemComponent],
  templateUrl: './lesson-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LessonListComponent {
  readonly lessons = input.required<Lesson[]>();
  readonly courseId = input.required<CourseId>();
  readonly reorder = output<string[]>();
  readonly renameLesson = output<{ lessonId: string; title: string }>();
  readonly deleteLesson = output<string>();
  readonly videoChanged = output<void>();
  readonly videoStateChanged = output<VideoState>();

  onDrop(event: CdkDragDrop<Lesson[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.lessons()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.reorder.emit(next.map((l) => l.id));
  }
}

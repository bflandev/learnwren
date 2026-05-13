import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Output, input } from '@angular/core';

import type { CourseId, Lesson } from '@learnwren/shared-data-models';

import { LessonItemComponent } from '../lesson-item/lesson-item.component';

@Component({
  selector: 'lib-lesson-list',
  standalone: true,
  imports: [CdkDropList, CdkDrag, LessonItemComponent],
  templateUrl: './lesson-list.component.html',
})
export class LessonListComponent {
  readonly lessons = input.required<Lesson[]>();
  readonly courseId = input.required<CourseId>();
  @Output() readonly reorder = new EventEmitter<string[]>();
  @Output() readonly renameLesson = new EventEmitter<{ lessonId: string; title: string }>();
  @Output() readonly deleteLesson = new EventEmitter<string>();
  @Output() readonly videoChanged = new EventEmitter<void>();

  onDrop(event: CdkDragDrop<Lesson[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.lessons()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.reorder.emit(next.map((l) => l.id));
  }
}

import { Component, EventEmitter, Output, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Lesson, Module } from '@learnwren/shared-data-models';

import { LessonListComponent } from '../lesson-list/lesson-list.component';

@Component({
  selector: 'lib-module-item',
  standalone: true,
  imports: [FormsModule, LessonListComponent],
  templateUrl: './module-item.component.html',
})
export class ModuleItemComponent {
  readonly module = input.required<Module>();
  readonly lessons = input.required<Lesson[]>();
  @Output() readonly renameModule = new EventEmitter<string>();
  @Output() readonly deleteModule = new EventEmitter<void>();
  @Output() readonly addLesson = new EventEmitter<string>();
  @Output() readonly renameLesson = new EventEmitter<{ lessonId: string; title: string }>();
  @Output() readonly deleteLesson = new EventEmitter<string>();
  @Output() readonly reorderLessons = new EventEmitter<string[]>();

  readonly editing = signal(false);
  readonly draftTitle = signal('');
  readonly addingLesson = signal(false);
  readonly newLessonTitle = signal('');

  startEdit(): void {
    this.draftTitle.set(this.module().title);
    this.editing.set(true);
  }

  commit(): void {
    const next = this.draftTitle().trim();
    if (next.length > 0 && next !== this.module().title) {
      this.renameModule.emit(next);
    }
    this.editing.set(false);
  }

  cancel(): void {
    this.editing.set(false);
  }

  beginAddLesson(): void {
    this.newLessonTitle.set('');
    this.addingLesson.set(true);
  }

  commitAddLesson(): void {
    const t = this.newLessonTitle().trim();
    if (t.length > 0) {
      this.addLesson.emit(t);
    }
    this.addingLesson.set(false);
  }
}

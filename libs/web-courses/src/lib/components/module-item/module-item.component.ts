import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import type { CourseId, Lesson, Module, VideoState } from '@learnwren/shared-data-models';

import { LwButtonDirective, LwCardComponent, LwInputDirective } from '@learnwren/web-ui';

import { LessonListComponent } from '../lesson-list/lesson-list.component';

@Component({
  selector: 'lib-module-item',
  standalone: true,
  imports: [DatePipe, FormsModule, LessonListComponent, LwButtonDirective, LwCardComponent, LwInputDirective],
  templateUrl: './module-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModuleItemComponent {
  readonly module = input.required<Module>();
  readonly lessons = input.required<Lesson[]>();
  readonly courseId = input.required<CourseId>();
  readonly coursePublished = input<boolean>(false);
  readonly renameModule = output<string>();
  readonly deleteModule = output<void>();
  readonly addLesson = output<string>();
  readonly renameLesson = output<{ lessonId: string; title: string }>();
  readonly deleteLesson = output<string>();
  readonly reorderLessons = output<string[]>();
  readonly videoChanged = output<void>();
  readonly videoStateChanged = output<VideoState>();
  readonly notifyModule = output<void>();

  readonly alreadyNotified = computed(() => this.module().studentsNotifiedAt != null);
  readonly canNotify = computed(
    () => this.coursePublished() && this.lessons().length > 0 && !this.alreadyNotified(),
  );

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
    if (!this.addingLesson()) return;
    this.addingLesson.set(false);
    const t = this.newLessonTitle().trim();
    if (t.length > 0) {
      this.addLesson.emit(t);
    }
  }
}

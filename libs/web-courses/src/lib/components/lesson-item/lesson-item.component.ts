import { Component, EventEmitter, Output, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Lesson } from '@learnwren/shared-data-models';

@Component({
  selector: 'lib-lesson-item',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './lesson-item.component.html',
})
export class LessonItemComponent {
  readonly lesson = input.required<Lesson>();
  @Output() readonly rename = new EventEmitter<string>();
  @Output() readonly delete = new EventEmitter<void>();

  readonly editing = signal(false);
  readonly draftTitle = signal('');

  startEdit(): void {
    this.draftTitle.set(this.lesson().title);
    this.editing.set(true);
  }

  commit(): void {
    const next = this.draftTitle().trim();
    if (next.length === 0 || next === this.lesson().title) {
      this.editing.set(false);
      return;
    }
    this.rename.emit(next);
    this.editing.set(false);
  }

  cancel(): void {
    this.editing.set(false);
  }
}

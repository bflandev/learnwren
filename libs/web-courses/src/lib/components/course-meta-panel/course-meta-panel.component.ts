import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Course } from '@learnwren/shared-data-models';
import {
  HlmButton,
  HlmCard,
  HlmFormField,
  HlmFormFieldControl,
  HlmInput,
  HlmLabel,
  HlmTextarea,
} from '@learnwren/web-ui';

import type { UpdateCourseInput } from '../../courses.service';

@Component({
  selector: 'lib-course-meta-panel',
  standalone: true,
  imports: [FormsModule, HlmButton, HlmCard, HlmFormField, HlmFormFieldControl, HlmInput, HlmLabel, HlmTextarea],
  templateUrl: './course-meta-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseMetaPanelComponent {
  readonly course = input.required<Course>();
  readonly update = output<UpdateCourseInput>();
  readonly deleteCourse = output<void>();

  // Drafts are linked to the VALUE (via computed), not the course object:
  // unrelated course refreshes (cover upload, video polling) replace the
  // object without changing these strings and must not clobber an
  // in-progress edit. A real value change (own save landing) still reseeds.
  private readonly courseTitle = computed(() => this.course().title);
  private readonly courseDescription = computed(() => this.course().description);
  readonly draftTitle = linkedSignal(() => this.courseTitle());
  readonly draftDescription = linkedSignal(() => this.courseDescription());

  commitTitle(): void {
    const next = this.draftTitle().trim();
    if (next.length === 0 || next === this.course().title) {
      // Abandoned edit (cleared or unchanged): restore the stored value —
      // the linkedSignal won't reseed on its own since the source is unchanged.
      this.draftTitle.set(this.course().title);
      return;
    }
    this.update.emit({ title: next });
  }

  commitDescription(): void {
    const next = this.draftDescription().trim();
    if (next.length === 0 || next === this.course().description) {
      this.draftDescription.set(this.course().description);
      return;
    }
    this.update.emit({ description: next });
  }
}

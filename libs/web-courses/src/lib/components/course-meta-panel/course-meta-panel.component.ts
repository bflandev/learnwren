import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Course } from '@learnwren/shared-data-models';
import { LwButtonDirective, LwCardComponent, LwInputDirective } from '@learnwren/web-ui';

import type { UpdateCourseInput } from '../../courses.service';

@Component({
  selector: 'lib-course-meta-panel',
  standalone: true,
  imports: [FormsModule, LwButtonDirective, LwCardComponent, LwInputDirective],
  templateUrl: './course-meta-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseMetaPanelComponent {
  readonly course = input.required<Course>();
  readonly update = output<UpdateCourseInput>();
  readonly deleteCourse = output<void>();

  readonly draftTitle = signal('');
  readonly draftDescription = signal('');

  commitTitle(): void {
    const next = this.draftTitle().trim();
    if (next.length === 0 || next === this.course().title) return;
    this.update.emit({ title: next });
  }

  commitDescription(): void {
    const next = this.draftDescription().trim();
    if (next.length === 0 || next === this.course().description) return;
    this.update.emit({ description: next });
  }

  syncDrafts(): void {
    this.draftTitle.set(this.course().title);
    this.draftDescription.set(this.course().description);
  }
}

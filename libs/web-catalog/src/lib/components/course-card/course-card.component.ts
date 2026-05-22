import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CourseSummary } from '@learnwren/shared-data-models';
import { LwCardComponent, LwCoverComponent, LwPillComponent } from '@learnwren/web-ui';

@Component({
  selector: 'lib-course-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LwCardComponent, LwCoverComponent, LwPillComponent],
  templateUrl: './course-card.component.html',
})
export class CourseCardComponent {
  readonly course = input.required<CourseSummary>();
}

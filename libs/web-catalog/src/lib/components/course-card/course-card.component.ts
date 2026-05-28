import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CourseSummary } from '@learnwren/shared-data-models';
import {
  LwAvatarComponent,
  LwCardComponent,
  LwCoverComponent,
  LwPillComponent,
  coverToneForId,
} from '@learnwren/web-ui';

@Component({
  selector: 'lib-course-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LwAvatarComponent, LwCardComponent, LwCoverComponent, LwPillComponent],
  templateUrl: './course-card.component.html',
})
export class CourseCardComponent {
  readonly course = input.required<CourseSummary>();
  readonly coverTone = computed(() => coverToneForId(this.course().id));
}

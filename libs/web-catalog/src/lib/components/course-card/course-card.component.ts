import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CourseSummary } from '@learnwren/shared-data-models';
import {
  HlmAvatar,
  HlmBadge,
  HlmCard,
  LwCoverComponent,
  avatarToneFor,
  coverToneForId,
  deriveInitials,
} from '@learnwren/web-ui';

@Component({
  selector: 'lib-course-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HlmAvatar, HlmBadge, HlmCard, LwCoverComponent],
  templateUrl: './course-card.component.html',
})
export class CourseCardComponent {
  readonly course = input.required<CourseSummary>();
  readonly completed = input(false);
  readonly coverTone = computed(() => coverToneForId(this.course().id));
  readonly avatarTone = computed(() => avatarToneFor(this.course().instructorId));
  readonly avatarInitials = computed(() => deriveInitials(this.course().instructorDisplayName));
}

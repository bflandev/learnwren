import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CourseSummary } from '@learnwren/shared-data-models';
import { LwCardComponent, LwCoverComponent, LwPillComponent, type LwCoverTone } from '@learnwren/web-ui';

const COVER_TONES: readonly LwCoverTone[] = ['moss', 'clay', 'bark', 'paper', 'ochre'];

@Component({
  selector: 'lib-course-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LwCardComponent, LwCoverComponent, LwPillComponent],
  templateUrl: './course-card.component.html',
})
export class CourseCardComponent {
  readonly course = input.required<CourseSummary>();
  readonly coverTone = computed<LwCoverTone>(() => {
    const id = this.course().id;
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % COVER_TONES.length;
    return COVER_TONES[index] ?? 'moss';
  });
}

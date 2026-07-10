import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import type { EnrollmentListItem } from '@learnwren/shared-data-models';
import { EnrollmentService } from '@learnwren/web-enrollment';

/**
 * "Completed courses" section on /settings/profile (US-06-02: the badge on
 * "my profile"). Self-loading; renders nothing while loading, on error, or
 * when the caller has completed nothing.
 */
@Component({
  selector: 'lib-completed-courses',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  templateUrl: './completed-courses.component.html',
})
export class CompletedCoursesComponent implements OnInit {
  private readonly enrollments = inject(EnrollmentService);

  readonly completed = signal<EnrollmentListItem[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const view = await this.enrollments.listMyEnrollments();
      this.completed.set(view.enrollments.filter((e) => e.completedAt != null));
    } catch {
      // Section is decorative — a failed load just hides it.
    }
  }
}

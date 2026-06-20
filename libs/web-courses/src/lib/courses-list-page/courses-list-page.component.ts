import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Course } from '@learnwren/shared-data-models';
import { LwCardComponent, LwCoverComponent, LwPillComponent, coverToneForId } from '@learnwren/web-ui';

import { CoursesService } from '../courses.service';

@Component({
  selector: 'lib-courses-list-page',
  standalone: true,
  imports: [RouterLink, LwCardComponent, LwCoverComponent, LwPillComponent],
  templateUrl: './courses-list-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoursesListPageComponent {
  private readonly service = inject(CoursesService);
  readonly courses = signal<Course[] | null>(null);
  // Stryker disable next-line BooleanLiteral: equivalent — the constructor calls refresh() which synchronously runs error.set(false) before any observer can read the initial value.
  readonly error = signal<boolean>(false);
  readonly coverToneForId = coverToneForId;

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.error.set(false);
    this.courses.set(null);
    try {
      this.courses.set(await this.service.listCourses());
    } catch {
      // Surface a recoverable error state instead of an unhandled rejection that
      // leaves the page stuck on "Loading…".
      this.error.set(true);
    }
  }
}

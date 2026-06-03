import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Course } from '@learnwren/shared-data-models';
import { AuthService } from '@learnwren/web-auth';
import { CoursesService } from '@learnwren/web-courses';
import { LwButtonDirective, LwCardComponent, LwCoverComponent, LwPillComponent, coverToneForId } from '@learnwren/web-ui';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, LwButtonDirective, LwCardComponent, LwCoverComponent, LwPillComponent],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly coursesService = inject(CoursesService);

  protected readonly displayName = computed(() => this.auth.currentUser()?.displayName ?? '');
  protected readonly role = computed(() => this.auth.currentUser()?.role ?? '');
  protected readonly isInstructor = computed(() => this.auth.currentUser()?.role === 'INSTRUCTOR');
  readonly courses = signal<Course[] | null>(null);
  readonly error = signal<string | null>(null);
  readonly coverToneForId = coverToneForId;

  private hasLoaded = false;

  constructor() {
    // currentUser() is `undefined` until GET /auth/me resolves, so a
    // construction-time isInstructor() check races auth on a hard reload and
    // would never load an instructor's courses. Fire the load from an effect
    // once the user resolves to an instructor, guarding against a double-load.
    effect(() => {
      if (this.isInstructor() && !this.hasLoaded) {
        this.hasLoaded = true;
        void this.loadCourses();
      }
    });
  }

  private async loadCourses(): Promise<void> {
    try {
      this.error.set(null);
      this.courses.set(await this.coursesService.listCourses());
    } catch {
      this.error.set('We could not load your courses. Please try again.');
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    window.location.assign('/login');
  }
}

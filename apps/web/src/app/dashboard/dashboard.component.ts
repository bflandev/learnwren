import { Component, inject, signal } from '@angular/core';
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
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly coursesService = inject(CoursesService);

  protected readonly displayName = () => this.auth.currentUser()?.displayName ?? '';
  protected readonly role = () => this.auth.currentUser()?.role ?? '';
  protected readonly isInstructor = () => this.auth.currentUser()?.role === 'INSTRUCTOR';
  readonly courses = signal<Course[] | null>(null);
  readonly coverToneForId = coverToneForId;

  constructor() {
    if (this.isInstructor()) {
      void this.loadCourses();
    }
  }

  private async loadCourses(): Promise<void> {
    this.courses.set(await this.coursesService.listCourses());
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    window.location.assign('/login');
  }
}

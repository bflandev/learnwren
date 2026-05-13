import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Course } from '@learnwren/shared-data-models';

import { CoursesService } from '../courses.service';

@Component({
  selector: 'lib-courses-list-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './courses-list-page.component.html',
})
export class CoursesListPageComponent {
  private readonly service = inject(CoursesService);
  readonly courses = signal<Course[] | null>(null);

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.courses.set(null);
    this.courses.set(await this.service.listCourses());
  }
}

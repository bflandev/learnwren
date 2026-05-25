import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import {
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

import { LwButtonDirective, LwCardComponent, LwInputDirective } from '@learnwren/web-ui';

import { CoursesService } from '../courses.service';
import type { CoursesApiErrorBody } from '../types/api-error';

@Component({
  selector: 'lib-course-create-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LwButtonDirective, LwCardComponent, LwInputDirective],
  templateUrl: './course-create-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseCreatePageComponent {
  private readonly service = inject(CoursesService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly categories = COURSE_CATEGORIES;
  readonly difficulties = COURSE_DIFFICULTIES;

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    longDescription: [''],
    category: [''],
    difficulty: [''],
  });

  readonly busy = signal(false);
  readonly fieldErrors = signal<Record<string, string[]>>({});
  readonly genericError = signal<string | null>(null);

  async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.fieldErrors.set({});
    this.genericError.set(null);
    try {
      const course = await this.service.createCourse(this.buildPayload());
      await this.router.navigateByUrl(`/courses/${course.id}/edit`);
    } catch (err) {
      this.handleSubmitError(err);
    } finally {
      this.busy.set(false);
    }
  }

  private buildPayload() {
    const v = this.form.getRawValue();
    return {
      title: v.title.trim(),
      description: v.description.trim(),
      ...(v.longDescription ? { longDescription: v.longDescription.trim() } : {}),
      ...(v.category ? { category: v.category as CourseCategory } : {}),
      ...(v.difficulty ? { difficulty: v.difficulty as CourseDifficulty } : {}),
    };
  }

  private handleSubmitError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse)) {
      this.genericError.set('Failed to create course.');
      return;
    }
    const body = err.error as CoursesApiErrorBody;
    if (body?.error?.code === 'VALIDATION_FAILED') {
      const fieldErrors = (body.error.details?.['fieldErrors'] as Record<string, string[]>) ?? {};
      this.fieldErrors.set(fieldErrors);
      return;
    }
    this.genericError.set(body?.error?.message ?? 'Failed to create course.');
  }
}

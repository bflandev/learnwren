import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import {
  COURSE_DIFFICULTIES,
  type CourseCategory,
  type CourseCategoryDoc,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

import { CategoriesService } from '@learnwren/web-catalog';
import { HlmButton, HlmCard, HlmInput, HlmLabel, HlmTextarea } from '@learnwren/web-ui';

import type { CoursesApiErrorBody } from '@learnwren/shared-data-models';

import { CoursesService } from '../courses.service';

@Component({
  selector: 'lib-course-create-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, HlmButton, HlmCard, HlmInput, HlmLabel, HlmTextarea],
  templateUrl: './course-create-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseCreatePageComponent {
  private readonly service = inject(CoursesService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  /** Admin-managed categories (US-08-02); API returns them alphabetical. */
  readonly categories = signal<readonly CourseCategoryDoc[]>([]);
  readonly difficulties = COURSE_DIFFICULTIES;

  constructor() {
    void this.categoriesService
      .list()
      .then((cats) => this.categories.set(cats))
      .catch(() => {
        // The category dropdown is best-effort — the form still submits without one.
      });
  }

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

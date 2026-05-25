import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink, type ParamMap } from '@angular/router';

import type { CourseCatalogDetail, EnrollmentStatusView } from '@learnwren/shared-data-models';
import { LwCoverComponent, LwPillComponent, coverToneForId } from '@learnwren/web-ui';
import { CourseEnrollmentPanelComponent, EnrollmentService } from '@learnwren/web-enrollment';
import { AuthService } from '@learnwren/web-auth';

import { CatalogService } from '../catalog.service';
import { ModuleOutlineComponent } from '../components/module-outline/module-outline.component';

@Component({
  selector: 'lib-course-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwCoverComponent, LwPillComponent, ModuleOutlineComponent, CourseEnrollmentPanelComponent, RouterLink],
  templateUrl: './course-detail-page.component.html',
})
export class CourseDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(CatalogService);
  private readonly auth = inject(AuthService);
  private readonly enrollments = inject(EnrollmentService);

  readonly course = signal<CourseCatalogDetail | null>(null);
  readonly notFound = signal(false);
  readonly error = signal(false);
  readonly enrollmentStatus = signal<EnrollmentStatusView | null>(null);

  readonly coverTone = computed(() => {
    const c = this.course();
    return c ? coverToneForId(c.id) : 'ink';
  });

  readonly firstLessonHref = computed<readonly [string, string, string] | null>(() => {
    const c = this.course();
    const firstModule = c?.modules?.[0];
    const firstLesson = firstModule?.lessons?.[0];
    return c && firstLesson ? (['/learn', c.id, firstLesson.id] as const) : null;
  });

  readonly canStartLearning = computed<boolean>(() => {
    const status = this.enrollmentStatus();
    if (!this.firstLessonHref()) return false;
    return status?.isOwner === true || status?.enrollment?.status === 'ACTIVE';
  });

  readonly showNoLessons = computed<boolean>(() => {
    if (this.firstLessonHref()) return false;
    const status = this.enrollmentStatus();
    return status?.isOwner === true || status?.enrollment?.status === 'ACTIVE';
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.load(params);
    });
  }

  private async resolveEnrollmentStatus(courseId: string): Promise<void> {
    try {
      const view = await this.enrollments.getEnrollmentStatus(courseId);
      this.enrollmentStatus.set(view);
    } catch {
      // enrollment status is best-effort; CTA simply stays hidden on failure
    }
  }

  private async load(params: ParamMap): Promise<void> {
    const id = params.get('id');
    this.course.set(null);
    this.notFound.set(false);
    this.error.set(false);
    this.enrollmentStatus.set(null);
    if (!id) {
      this.notFound.set(true);
      return;
    }
    try {
      this.course.set(await this.service.getCourseDetail(id));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.notFound.set(true);
      } else {
        this.error.set(true);
      }
      return;
    }
    if (this.auth.currentUser()) {
      await this.resolveEnrollmentStatus(id);
    }
  }
}

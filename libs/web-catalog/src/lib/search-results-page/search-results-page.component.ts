import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap, Router } from '@angular/router';

import type { CourseCatalogPage } from '@learnwren/shared-data-models';
import { AuthService } from '@learnwren/web-auth';
import { EnrollmentService } from '@learnwren/web-enrollment';

import { CatalogService } from '../catalog.service';
import { CourseCardComponent } from '../components/course-card/course-card.component';

@Component({
  selector: 'lib-search-results-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CourseCardComponent],
  templateUrl: './search-results-page.component.html',
})
export class SearchResultsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CatalogService);
  private readonly auth = inject(AuthService);
  private readonly enrollments = inject(EnrollmentService);

  readonly query = signal('');
  readonly result = signal<CourseCatalogPage | null>(null);
  readonly error = signal(false);
  /** Course ids the signed-in caller has completed — overlays a badge on cards (US-06-02). */
  readonly completedCourseIds = signal<ReadonlySet<string>>(new Set());

  /**
   * Monotonic token identifying the most recent load(). The HTTP wrapper returns
   * a non-cancellable Promise, so a slow earlier request can resolve AFTER a
   * newer one (rapid pagination click). Stamping each load and discarding any
   * result whose token is stale prevents an old response from overwriting newer
   * search results.
   */
  private loadToken = 0;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.load(params);
    });

    // Completion badges are orthogonal to the query — load once, matching the
    // catalog page so a completed course looks the same on both surfaces.
    if (this.auth.currentUser()) {
      void this.enrollments
        .listMyEnrollments()
        .then((view) => {
          this.completedCourseIds.set(
            new Set(
              view.enrollments.filter((e) => e.completedAt != null).map((e) => e.courseId),
            ),
          );
        })
        .catch(() => {
          // Badge overlay is best-effort — results render without it.
        });
    }
  }

  private async load(params: ParamMap): Promise<void> {
    // Stryker disable next-line UpdateOperator: ++/-- both yield unique monotonic tokens; only consumer is the !== staleness check — equivalent
    const token = ++this.loadToken;
    const q = (params.get('q') ?? '').trim();
    if (!q) {
      void this.router.navigate(['/catalog']);
      return;
    }
    const page = Number(params.get('page')) || 1;
    this.query.set(q);
    this.result.set(null);
    this.error.set(false);
    try {
      const result = await this.service.search(q, page);
      if (token !== this.loadToken) return; // superseded by a newer load
      this.result.set(result);
    } catch {
      if (token !== this.loadToken) return; // superseded by a newer load
      this.error.set(true);
    }
  }

  goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }
}

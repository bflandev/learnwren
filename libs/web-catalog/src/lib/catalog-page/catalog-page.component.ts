import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap, Router } from '@angular/router';

import type {
  CatalogSort,
  CourseCatalogPage,
  CourseCategory,
  CourseCategoryDoc,
  CourseDifficulty,
} from '@learnwren/shared-data-models';
import { AuthService } from '@learnwren/web-auth';
import { EnrollmentService } from '@learnwren/web-enrollment';

import { HlmButton } from '@learnwren/web-ui';

import { CatalogService } from '../catalog.service';
import { CategoriesService } from '../categories.service';
import {
  CatalogFilterBarComponent,
  type CatalogFilterChange,
} from '../components/catalog-filter-bar/catalog-filter-bar.component';
import { CourseCardComponent } from '../components/course-card/course-card.component';

@Component({
  selector: 'lib-catalog-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CourseCardComponent, CatalogFilterBarComponent, HlmButton],
  templateUrl: './catalog-page.component.html',
})
export class CatalogPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CatalogService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly auth = inject(AuthService);
  private readonly enrollments = inject(EnrollmentService);

  readonly result = signal<CourseCatalogPage | null>(null);
  readonly error = signal(false);
  readonly category = signal<CourseCategory | undefined>(undefined);
  readonly difficulty = signal<CourseDifficulty | undefined>(undefined);
  readonly sort = signal<CatalogSort>('NEWEST');
  readonly filtersActive = signal(false);
  /** Admin-managed categories for the filter bar (US-08-02); API returns them alphabetical. */
  readonly categories = signal<readonly CourseCategoryDoc[]>([]);

  /** Course ids the signed-in caller has completed — overlays a badge on cards. */
  readonly completedCourseIds = signal<ReadonlySet<string>>(new Set());

  /**
   * Monotonic token identifying the most recent load(). The HTTP wrapper returns
   * a non-cancellable Promise, so a slow earlier request can resolve AFTER a
   * newer one (rapid filter change / pagination click). Stamping each load and
   * discarding any result whose token is stale prevents an old response from
   * overwriting newer course data.
   */
  private loadToken = 0;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.load(params);
    });

    // Filter options are orthogonal to filter state — load once.
    void this.categoriesService
      .list()
      .then((cats) => this.categories.set(cats))
      .catch(() => {
        // The category dropdown is best-effort — the catalogue renders without it.
      });

    // Completion badges are orthogonal to filters — load once, not per filter change.
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
          // Badge overlay is best-effort — the catalog renders without it.
        });
    }
  }

  private async load(params: ParamMap): Promise<void> {
    // Stryker disable next-line UpdateOperator: ++/-- both yield unique monotonic tokens; only consumer is the !== staleness check — equivalent
    const token = ++this.loadToken;
    const category = (params.get('category') as CourseCategory | null) ?? undefined;
    const difficulty = (params.get('difficulty') as CourseDifficulty | null) ?? undefined;
    const sort = (params.get('sort') as CatalogSort | null) ?? 'NEWEST';
    const page = Number(params.get('page')) || 1;

    this.category.set(category);
    this.difficulty.set(difficulty);
    this.sort.set(sort);
    this.filtersActive.set(category !== undefined || difficulty !== undefined);
    this.result.set(null);
    this.error.set(false);

    try {
      const result = await this.service.getCatalogue({ page, sort, category, difficulty });
      if (token !== this.loadToken) return; // superseded by a newer load
      this.result.set(result);
    } catch {
      if (token !== this.loadToken) return; // superseded by a newer load
      this.error.set(true);
    }
  }

  onFilterChange(change: CatalogFilterChange): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...change, page: 1 },
      queryParamsHandling: 'merge',
    });
  }

  goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }
}

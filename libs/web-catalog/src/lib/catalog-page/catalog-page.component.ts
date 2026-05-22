import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap, Router } from '@angular/router';

import type {
  CatalogSort,
  CourseCatalogPage,
  CourseCategory,
  CourseDifficulty,
} from '@learnwren/shared-data-models';

import { CatalogService } from '../catalog.service';
import {
  CatalogFilterBarComponent,
  type CatalogFilterChange,
} from '../components/catalog-filter-bar/catalog-filter-bar.component';
import { CourseCardComponent } from '../components/course-card/course-card.component';

@Component({
  selector: 'lib-catalog-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CourseCardComponent, CatalogFilterBarComponent],
  templateUrl: './catalog-page.component.html',
})
export class CatalogPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CatalogService);

  readonly result = signal<CourseCatalogPage | null>(null);
  readonly error = signal(false);
  readonly category = signal<CourseCategory | undefined>(undefined);
  readonly difficulty = signal<CourseDifficulty | undefined>(undefined);
  readonly sort = signal<CatalogSort>('NEWEST');
  readonly filtersActive = signal(false);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.load(params);
    });
  }

  private async load(params: ParamMap): Promise<void> {
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
      this.result.set(await this.service.getCatalogue({ page, sort, category, difficulty }));
    } catch {
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

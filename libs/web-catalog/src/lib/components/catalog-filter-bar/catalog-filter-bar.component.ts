import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import {
  CATALOG_SORT_OPTIONS,
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  type CatalogSort,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

export interface CatalogFilterChange {
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  sort?: CatalogSort;
}

@Component({
  selector: 'lib-catalog-filter-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog-filter-bar.component.html',
})
export class CatalogFilterBarComponent {
  readonly category = input<CourseCategory | undefined>(undefined);
  readonly difficulty = input<CourseDifficulty | undefined>(undefined);
  readonly sort = input<CatalogSort>('NEWEST');

  readonly filterChange = output<CatalogFilterChange>();

  readonly categories = COURSE_CATEGORIES;
  readonly difficulties = COURSE_DIFFICULTIES;
  readonly sorts = CATALOG_SORT_OPTIONS;

  onCategoryChange(value: string): void {
    this.filterChange.emit({ category: (value || undefined) as CourseCategory | undefined });
  }

  onDifficultyChange(value: string): void {
    this.filterChange.emit({
      difficulty: (value || undefined) as CourseDifficulty | undefined,
    });
  }

  onSortChange(value: string): void {
    this.filterChange.emit({ sort: value as CatalogSort });
  }
}

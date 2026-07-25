import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  CATALOG_SORT_OPTIONS,
  COURSE_DIFFICULTIES,
  type CatalogSort,
  type CourseCategory,
  type CourseCategoryDoc,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';
import { HlmSelectSingleImports } from '@learnwren/web-ui';

export interface CatalogFilterChange {
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  sort?: CatalogSort;
}

@Component({
  selector: 'lib-catalog-filter-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...HlmSelectSingleImports],
  templateUrl: './catalog-filter-bar.component.html',
})
export class CatalogFilterBarComponent {
  readonly category = input<CourseCategory | undefined>(undefined);
  readonly difficulty = input<CourseDifficulty | undefined>(undefined);
  readonly sort = input<CatalogSort>('NEWEST');
  /** Admin-managed categories (US-08-02), fetched by the page and passed down. */
  readonly categories = input<readonly CourseCategoryDoc[]>([]);

  readonly filterChange = output<CatalogFilterChange>();

  readonly difficulties = COURSE_DIFFICULTIES;
  readonly sorts = CATALOG_SORT_OPTIONS;

  /** Display name of the active category; undefined until the async list carries it. */
  readonly categoryName = computed(
    () => this.categories().find((c) => c.id === this.category())?.name,
  );

  /** hlmSelectSingle emits `T | null`; normalise to '' so the guards stay falsy checks. */
  private static asValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  onCategoryChange(value: unknown): void {
    const v = CatalogFilterBarComponent.asValue(value);
    this.filterChange.emit({ category: (v || undefined) as CourseCategory | undefined });
  }

  onDifficultyChange(value: unknown): void {
    const v = CatalogFilterBarComponent.asValue(value);
    this.filterChange.emit({
      difficulty: (v || undefined) as CourseDifficulty | undefined,
    });
  }

  onSortChange(value: unknown): void {
    this.filterChange.emit({ sort: CatalogFilterBarComponent.asValue(value) as CatalogSort });
  }
}

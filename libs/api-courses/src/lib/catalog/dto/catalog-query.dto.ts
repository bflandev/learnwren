import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  CATALOG_SORT_OPTIONS,
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  type CatalogSort,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

export class CatalogQueryDto {
  // Cap protects the public, unauthenticated endpoint from unbounded read
  // amplification — every catalog page currently triggers a full collection
  // scan, so a caller passing huge page numbers can sustain expensive scans.
  // 10_000 pages × default page size > any plausible catalogue.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @IsIn(CATALOG_SORT_OPTIONS as readonly string[])
  sort?: CatalogSort;

  @IsOptional()
  @IsIn(COURSE_CATEGORIES as readonly string[])
  category?: CourseCategory;

  @IsOptional()
  @IsIn(COURSE_DIFFICULTIES as readonly string[])
  difficulty?: CourseDifficulty;
}

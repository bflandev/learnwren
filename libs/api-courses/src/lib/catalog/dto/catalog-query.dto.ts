import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

import {
  CATALOG_SORT_OPTIONS,
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  type CatalogSort,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

export class CatalogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
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

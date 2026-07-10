import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import {
  COURSE_DIFFICULTIES,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  longDescription?: string;

  @IsOptional()
  // Categories are admin-managed (US-08-02); existence is validated in CoursesService.
  @IsString()
  category?: CourseCategory;

  @IsOptional()
  @IsIn(COURSE_DIFFICULTIES as readonly string[])
  difficulty?: CourseDifficulty;
}

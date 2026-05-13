import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import {
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

export class CreateCourseDto {
  @IsString()
  @Length(1, 100)
  title!: string;

  @IsString()
  @Length(1, 500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  longDescription?: string;

  @IsOptional()
  @IsIn(COURSE_CATEGORIES as readonly string[])
  category?: CourseCategory;

  @IsOptional()
  @IsIn(COURSE_DIFFICULTIES as readonly string[])
  difficulty?: CourseDifficulty;
}

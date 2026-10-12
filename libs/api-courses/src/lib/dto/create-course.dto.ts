import { IsIn, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

import {
  COURSE_DIFFICULTIES,
  type CourseCategory,
  type CourseDifficulty,
} from '@learnwren/shared-data-models';

import { OptionalField } from './optional-field';

export class CreateCourseDto {
  @IsString()
  @Length(1, 100)
  title!: string;

  @IsString()
  @Length(1, 500)
  description!: string;

  @OptionalField()
  @IsString()
  @MaxLength(5000)
  longDescription?: string;

  @OptionalField()
  // Categories are admin-managed (US-08-02); existence is validated in CoursesService.
  @IsString()
  @IsNotEmpty()
  category?: CourseCategory;

  @OptionalField()
  @IsIn(COURSE_DIFFICULTIES as readonly string[])
  difficulty?: CourseDifficulty;
}

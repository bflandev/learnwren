import { IsNotEmpty, IsString } from 'class-validator';

import type { CourseId } from '@learnwren/shared-data-models';

export class EnrollCourseDto {
  @IsString()
  @IsNotEmpty()
  courseId!: CourseId;
}

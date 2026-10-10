import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { LESSON_TITLE_MAX_LENGTH } from '@learnwren/shared-data-models';

export class CreateLessonDto {
  @IsString()
  @Length(1, LESSON_TITLE_MAX_LENGTH)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

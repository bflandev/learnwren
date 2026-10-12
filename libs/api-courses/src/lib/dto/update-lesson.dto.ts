import { IsString, Length, MaxLength } from 'class-validator';

import { LESSON_TITLE_MAX_LENGTH } from '@learnwren/shared-data-models';

import { OptionalField } from './optional-field';

export class UpdateLessonDto {
  @OptionalField()
  @IsString()
  @Length(1, LESSON_TITLE_MAX_LENGTH)
  title?: string;

  @OptionalField()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

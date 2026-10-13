import { IsString, MaxLength } from 'class-validator';

import { EMAIL_MAX_LENGTH } from '@learnwren/shared-data-models';

export class ResendVerificationDto {
  @IsString()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;
}

import { IsString, MaxLength, MinLength } from 'class-validator';

import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '@learnwren/shared-data-models';

export class LoginDto {
  @IsString()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

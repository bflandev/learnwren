import { IsIn, IsString, MaxLength } from 'class-validator';

export class UpdateVideoFailedDto {
  @IsIn(['FAILED'])
  state!: 'FAILED';

  @IsString()
  @MaxLength(500)
  failureReason!: string;
}

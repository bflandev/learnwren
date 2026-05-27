import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @MinLength(1, { message: 'displayName must be at least 1 character' })
  @MaxLength(80, { message: 'displayName must be at most 80 characters' })
  displayName!: string;

  @IsString()
  @MaxLength(1000, { message: 'biography must be at most 1000 characters' })
  biography!: string;
}

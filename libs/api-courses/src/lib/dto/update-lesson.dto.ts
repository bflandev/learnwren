import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

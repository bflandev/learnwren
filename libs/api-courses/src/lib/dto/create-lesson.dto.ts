import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @Length(1, 100)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

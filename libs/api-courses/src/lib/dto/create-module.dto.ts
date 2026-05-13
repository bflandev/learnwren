import { IsString, Length } from 'class-validator';

export class CreateModuleDto {
  @IsString()
  @Length(1, 100)
  title!: string;
}

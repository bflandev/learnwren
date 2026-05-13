import { IsString, Length } from 'class-validator';

export class UpdateModuleDto {
  @IsString()
  @Length(1, 100)
  title!: string;
}

import { IsString, Length } from 'class-validator';
import { MODULE_TITLE_MAX_LENGTH } from '@learnwren/shared-data-models';

export class CreateModuleDto {
  @IsString()
  @Length(1, MODULE_TITLE_MAX_LENGTH)
  title!: string;
}

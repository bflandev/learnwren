import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MATERIAL_NAME_MAX_LENGTH } from '@learnwren/shared-data-models';

export class RenameMaterialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MATERIAL_NAME_MAX_LENGTH)
  displayName!: string;
}

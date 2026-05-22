import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

import { MATERIAL_MAX_SIZE_BYTES } from '@learnwren/shared-data-models';

export class CreateMaterialUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @IsInt()
  @Min(1)
  @Max(MATERIAL_MAX_SIZE_BYTES)
  sizeBytes!: number;
}

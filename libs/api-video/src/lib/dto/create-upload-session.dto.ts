import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  SUPPORTED_VIDEO_CONTENT_TYPES,
  type SupportedVideoContentType,
} from '@learnwren/shared-data-models';

export class CreateUploadSessionDto {
  @IsInt()
  @Min(1)
  @Max(10_000_000_000)
  sizeBytes!: number;

  @IsIn(SUPPORTED_VIDEO_CONTENT_TYPES as readonly string[])
  contentType!: SupportedVideoContentType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;
}

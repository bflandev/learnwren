import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SUPPORTED_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
] as const;

export type SupportedContentType = (typeof SUPPORTED_CONTENT_TYPES)[number];

export class CreateUploadSessionDto {
  @IsInt()
  @Min(1)
  @Max(10_000_000_000)
  sizeBytes!: number;

  @IsIn(SUPPORTED_CONTENT_TYPES as readonly string[])
  contentType!: SupportedContentType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;
}

import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { CATALOG_SEARCH_MAX_LENGTH } from '@learnwren/shared-data-models';

export class CatalogSearchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CATALOG_SEARCH_MAX_LENGTH)
  @Matches(/\S/, { message: 'q must not be blank' })
  q!: string;

  // Same cap as CatalogQueryDto — public unauthenticated endpoint.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}

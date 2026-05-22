import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CatalogSearchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/, { message: 'q must not be blank' })
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

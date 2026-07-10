import { IsString } from 'class-validator';

/**
 * Body of category create and rename. Type-guard only — emptiness, length,
 * and uniqueness are validated in CategoriesService/Repository so the client
 * receives typed error codes instead of ValidationPipe prose.
 */
export class CategoryNameDto {
  @IsString()
  name!: string;
}

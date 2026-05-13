import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}

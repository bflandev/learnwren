import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameMaterialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName!: string;
}

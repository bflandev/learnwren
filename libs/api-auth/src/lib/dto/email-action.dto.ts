import { IsOptional, IsString } from 'class-validator';

// Type guards only — length/value validation happens in
// AccountRecoveryService.applyEmailAction (memory: Nest ValidationPipe DTO
// short-circuit pre-empts typed error codes).
export class EmailActionDto {
  @IsString()
  mode!: string;

  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  newPassword?: string;
}

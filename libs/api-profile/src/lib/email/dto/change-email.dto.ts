import { Allow } from 'class-validator';

/**
 * Type-shape only — @Allow() is used instead of @IsString()/@IsEmail() to
 * whitelist both fields for the global ValidationPipe (whitelist + forbidNonWhitelisted)
 * without adding length/format validators. Validation logic lives in
 * EmailChangeService so the service can emit the feature's typed error codes
 * (CURRENT_PASSWORD_INVALID, EMAIL_INVALID, etc.) rather than a generic BAD_REQUEST.
 */
export class ChangeEmailDto {
  @Allow()
  newEmail!: string;

  @Allow()
  currentPassword!: string;
}

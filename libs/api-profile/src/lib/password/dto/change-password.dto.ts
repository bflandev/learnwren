import { Allow } from 'class-validator';

/**
 * Type-shape only — @Allow() whitelists both fields for the global ValidationPipe
 * (whitelist + forbidNonWhitelisted) without adding length/format validators.
 * Validation logic lives in PasswordChangeService so it can emit the feature's
 * typed error codes (CURRENT_PASSWORD_INVALID, NEW_PASSWORD_WEAK, etc.) rather
 * than a generic BAD_REQUEST.
 */
export class ChangePasswordDto {
  @Allow()
  currentPassword!: string;

  @Allow()
  newPassword!: string;
}

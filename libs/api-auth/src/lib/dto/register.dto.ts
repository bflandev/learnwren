import { IsString } from 'class-validator';

/**
 * Type-shape only — @IsString() whitelists each field for the global
 * ValidationPipe (whitelist + forbidNonWhitelisted) without adding
 * length/format validators. Length/format validation lives in
 * AuthService.validateRegisterInput so it can emit the feature's typed
 * error codes (INVALID_EMAIL, EMAIL_TOO_LONG, WEAK_PASSWORD,
 * PASSWORD_TOO_LONG, INVALID_DISPLAY_NAME) rather than a generic
 * BAD_REQUEST short-circuited by the pipe.
 */
export class RegisterDto {
  @IsString()
  email!: string;

  @IsString()
  password!: string;

  @IsString()
  displayName!: string;
}

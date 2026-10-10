import { Allow } from 'class-validator';

/**
 * Type-shape only — @Allow() whitelists the field for the global ValidationPipe
 * without length validators, so a wrong password surfaces as the typed
 * CURRENT_PASSWORD_INVALID from AccountDeletionService.
 */
export class DeleteAccountDto {
  @Allow()
  currentPassword!: string;
}

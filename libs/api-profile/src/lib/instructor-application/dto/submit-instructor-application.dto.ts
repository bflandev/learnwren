import { Allow } from 'class-validator';

/**
 * Type-shape only — @Allow() whitelists both fields for the global ValidationPipe
 * (whitelist + forbidNonWhitelisted) without adding length/format validators.
 * Non-empty + max-length validation lives in InstructorApplicationService so it
 * emits the typed INSTRUCTOR_APPLICATION_INVALID code, not a generic BAD_REQUEST.
 */
export class SubmitInstructorApplicationDto {
  @Allow()
  statement!: string;

  @Allow()
  expertise!: string;
}

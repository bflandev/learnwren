import { Allow } from 'class-validator';

/**
 * Type-shape only — @Allow() whitelists `reason` for the global ValidationPipe.
 * Type and length checks live in AdminInstructorApplicationService so they emit
 * the typed DECLINE_REASON_INVALID code, not a generic BAD_REQUEST.
 */
export class DeclineInstructorApplicationDto {
  @Allow()
  reason?: string;
}

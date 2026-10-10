import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

// Catch-all: domain-shaped errors (CURRENT_PASSWORD_INVALID, ACCOUNT_LOCKED,
// USER_HAS_COURSES, LAST_ADMIN, INTERNAL) render with their code; an
// unexpected re-auth failure still gets the 500 INTERNAL envelope.
@Catch()
export class AccountDeletionExceptionFilter implements ExceptionFilter {
  // Stryker disable next-line StringLiteral: Logger label is log-only.
  private readonly logger = new Logger('AccountDeletionExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

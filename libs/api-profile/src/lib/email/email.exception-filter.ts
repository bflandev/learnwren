import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { EmailChangeException } from './errors/email-change.exception';

@Catch(EmailChangeException, AuthException, HttpException)
export class EmailChangeExceptionFilter implements ExceptionFilter {
  // Stryker disable next-line StringLiteral: Logger label is log-only; never asserted, no control-flow/return/status effect.
  private readonly logger = new Logger('EmailChangeExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

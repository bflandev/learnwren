import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

import { AuthException } from './errors/auth.exception';

@Catch(AuthException, HttpException)
export class AuthExceptionFilter implements ExceptionFilter {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('AuthExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

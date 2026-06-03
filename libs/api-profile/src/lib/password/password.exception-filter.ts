import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { PasswordChangeException } from './errors/password-change.exception';

// Delegates rendering to the shared handleException() helper like every other
// per-feature filter, rather than hand-rolling codeForStatus (which had drifted:
// 'ERROR' fallback vs the shared 'HTTP_ERROR', and missing 413/415/422).
@Catch(PasswordChangeException, AuthException, HttpException)
export class PasswordChangeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PasswordChangeExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

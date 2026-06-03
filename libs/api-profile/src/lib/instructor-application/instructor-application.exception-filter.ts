import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { InstructorApplicationException } from './errors/instructor-application.exception';

// Catches AuthException (FirebaseSessionGuard) so an unauthenticated request
// renders 401 instead of leaking as a 500.
@Catch(InstructorApplicationException, AuthException, HttpException)
export class InstructorApplicationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('InstructorApplicationExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

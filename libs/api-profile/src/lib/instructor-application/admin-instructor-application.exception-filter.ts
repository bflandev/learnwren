import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';
import { AuthException } from '@learnwren/api-auth';

import { AdminInstructorApplicationException } from './errors/admin-instructor-application.exception';

@Catch(AdminInstructorApplicationException, AuthException, HttpException)
export class AdminInstructorApplicationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AdminInstructorApplicationExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

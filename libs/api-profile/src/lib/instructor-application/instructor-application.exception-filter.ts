import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

import { InstructorApplicationException } from './errors/instructor-application.exception';

@Catch(InstructorApplicationException, HttpException)
export class InstructorApplicationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('InstructorApplicationExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

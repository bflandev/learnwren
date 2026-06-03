import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { CoursesException } from '../errors/courses.exception';
import { LearnException } from './errors/learn.exception';

// Catches CoursesException because the enrollment repository re-checks
// enrollment inside its transactions and throws NotEnrolledException (a
// CoursesException) on POST /complete and POST /position — reachable via a real
// TOCTOU if the enrollment is withdrawn between the guard check and the commit.
@Catch(LearnException, CoursesException, AuthException, HttpException)
export class LearnExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('LearnExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}

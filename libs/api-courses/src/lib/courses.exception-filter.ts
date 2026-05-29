import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { CoursesException } from './errors/courses.exception';

/**
 * Narrowed to the domain + framework exception types with a stable wire shape;
 * anything else falls through to a generic 500 (no detail leaked). Rendering is
 * delegated to the shared api-http-errors helper.
 */
@Catch(CoursesException, AuthException, HttpException)
export class CoursesExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('CoursesExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { CoursesException } from '../errors/courses.exception';
import { CoverException } from './errors/cover.exception';

// Catches AuthException (FirebaseSessionGuard + InstructorRoleGuard, class-level)
// and CoursesException (CourseOwnerGuard, per-route) so guard 401/403s render as
// themselves instead of leaking as a 500.
@Catch(CoverException, CoursesException, AuthException, HttpException)
export class CoverExceptionFilter implements ExceptionFilter {
  // Stryker disable next-line StringLiteral: Logger category label — log-only, no observable behavior
  private readonly logger = new Logger('CoverExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

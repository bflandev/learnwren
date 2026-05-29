import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { CoursesException } from '../errors/courses.exception';
import { VideoException } from './errors/video.exception';

// Catches CoursesException because video routes reuse CourseOwnerGuard (which
// throws NotCourseOwnerException). Rendering delegated to the shared helper.
@Catch(VideoException, AuthException, CoursesException, HttpException)
export class VideoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('VideoExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}

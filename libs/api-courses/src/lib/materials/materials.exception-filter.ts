import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { CoursesException } from '../errors/courses.exception';
import { MaterialException } from './errors/material.exception';

@Catch(MaterialException, CoursesException, AuthException, HttpException)
export class MaterialsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('MaterialsExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}

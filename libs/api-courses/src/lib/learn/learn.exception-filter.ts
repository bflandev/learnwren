import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { LearnException } from './errors/learn.exception';

@Catch(LearnException, AuthException, HttpException)
export class LearnExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('LearnExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

import { CoverException } from './errors/cover.exception';

@Catch(CoverException, HttpException)
export class CoverExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('CoverExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

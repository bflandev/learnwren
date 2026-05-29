import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

import { PictureException } from './errors/picture.exception';

@Catch(PictureException, HttpException)
export class PictureExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PictureExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

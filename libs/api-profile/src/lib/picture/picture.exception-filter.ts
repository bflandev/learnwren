import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { PictureException } from './errors/picture.exception';

// Catches AuthException (FirebaseSessionGuard) so an unauthenticated request
// renders 401 instead of leaking as a 500.
@Catch(PictureException, AuthException, HttpException)
export class PictureExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PictureExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

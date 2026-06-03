import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { ProfileException } from './errors/profile.exception';

// Catches AuthException (FirebaseSessionGuard) so an unauthenticated request
// renders 401 instead of leaking as a 500.
@Catch(ProfileException, AuthException, HttpException)
export class ProfileExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProfileExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

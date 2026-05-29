import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

import { ProfileException } from './errors/profile.exception';

@Catch(ProfileException, HttpException)
export class ProfileExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProfileExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

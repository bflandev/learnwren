import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';
import { AuthException } from '@learnwren/api-auth';

import { AdminUsersException } from './errors/admin-users.exception';

@Catch(AdminUsersException, AuthException, HttpException)
export class AdminUsersExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AdminUsersExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}

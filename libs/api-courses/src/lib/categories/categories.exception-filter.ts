import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { CategoriesException } from './categories.exception';

/**
 * Narrowed to the domain + framework exception types with a stable wire shape;
 * anything else falls through to a generic 500 (no detail leaked). Rendering is
 * delegated to the shared api-http-errors helper.
 */
@Catch(CategoriesException, AuthException, HttpException)
export class CategoriesExceptionFilter implements ExceptionFilter {
  // Stryker disable next-line StringLiteral: the Logger category name is a cosmetic log label with no behavioral effect; nothing observable depends on its exact value.
  private readonly logger = new Logger('CategoriesExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}

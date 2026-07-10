import { Controller, Get, UseFilters } from '@nestjs/common';

import type { CourseCategoryDoc } from '@learnwren/shared-data-models';

import { CategoriesExceptionFilter } from './categories.exception-filter';
import { CategoriesService } from './categories.service';

/**
 * Public, read-only category list (US-08-02 AC 3). Unauthenticated by design —
 * the public catalogue filter and the course form both need it; it exposes
 * nothing but category names. Allowlisted in controller-guard-coverage.spec.
 */
@Controller('categories')
@UseFilters(CategoriesExceptionFilter)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  list(): Promise<CourseCategoryDoc[]> {
    return this.service.list();
  }
}

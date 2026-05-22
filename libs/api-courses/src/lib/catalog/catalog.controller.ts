import { Controller, Get, Param, Query, UseFilters } from '@nestjs/common';

import type {
  CourseCatalogDetail,
  CourseCatalogPage,
  CourseId,
} from '@learnwren/shared-data-models';

import { CoursesExceptionFilter } from '../courses.exception-filter';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CatalogSearchDto } from './dto/catalog-search.dto';
import { CatalogService } from './catalog.service';

/**
 * Public, unauthenticated course discovery. No `@UseGuards` — read-only and
 * only ever returns PUBLISHED data. `search` is declared before `:cid` so the
 * literal segment is never captured as a course id.
 */
@Controller('catalog')
@UseFilters(CoursesExceptionFilter)
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}

  @Get()
  list(@Query() query: CatalogQueryDto): Promise<CourseCatalogPage> {
    return this.svc.listCatalogue(query);
  }

  @Get('search')
  search(@Query() query: CatalogSearchDto): Promise<CourseCatalogPage> {
    return this.svc.search(query);
  }

  @Get(':cid')
  detail(@Param('cid') cid: CourseId): Promise<CourseCatalogDetail> {
    return this.svc.getCourseDetail(cid);
  }
}

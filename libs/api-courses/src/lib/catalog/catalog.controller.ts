import { Controller, Get, Header, Param, Query, UseFilters } from '@nestjs/common';

import type {
  CourseCatalogDetail,
  CourseCatalogPage,
  CourseId,
} from '@learnwren/shared-data-models';

import { CoursesExceptionFilter } from '../courses.exception-filter';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CatalogSearchDto } from './dto/catalog-search.dto';
import { CatalogService } from './catalog.service';
import { ParseCourseIdPipe } from './parse-course-id.pipe';

/**
 * Public catalog responses are identical for every anonymous visitor and only
 * ever expose PUBLISHED data, so a short shared-cache window lets the browser
 * and the hosting CDN absorb repeat traffic instead of re-running the read in a
 * cold-start-prone function. `s-maxage` targets the CDN; `max-age` the browser;
 * `stale-while-revalidate` hides the refresh latency. 60s keeps newly published
 * courses visible quickly. Safe to cache because these endpoints are
 * unauthenticated and never set a cookie.
 */
const CATALOG_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=60';

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
  @Header('Cache-Control', CATALOG_CACHE_CONTROL)
  list(@Query() query: CatalogQueryDto): Promise<CourseCatalogPage> {
    return this.svc.listCatalogue(query);
  }

  @Get('search')
  @Header('Cache-Control', CATALOG_CACHE_CONTROL)
  search(@Query() query: CatalogSearchDto): Promise<CourseCatalogPage> {
    return this.svc.search(query);
  }

  @Get(':cid')
  @Header('Cache-Control', CATALOG_CACHE_CONTROL)
  detail(@Param('cid', ParseCourseIdPipe) cid: CourseId): Promise<CourseCatalogDetail> {
    return this.svc.getCourseDetail(cid);
  }
}

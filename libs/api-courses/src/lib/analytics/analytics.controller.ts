import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';

import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesExceptionFilter } from '../courses.exception-filter';
import type { CourseScopedRequest } from '../types/loaded-course';
import { AnalyticsService } from './analytics.service';

/**
 * Owner-only course analytics (US-07-02). `CourseOwnerGuard` loads and
 * authorizes the course (404 missing / 403 not-owner) and attaches it to the
 * request; the session guard supplies the authenticated user (401 otherwise).
 */
@Controller('courses')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get(':cid/analytics')
  @UseGuards(CourseOwnerGuard)
  getAnalytics(@Req() req: CourseScopedRequest): Promise<CourseAnalyticsView> {
    if (!req.course) {
      return Promise.reject(new Error('AnalyticsController: CourseOwnerGuard did not attach course'));
    }
    return this.service.getAnalytics(req.course);
  }
}

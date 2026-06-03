import { Controller, HttpCode, Param, Post, Req, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { ModuleId, NotifyModuleResult } from '@learnwren/shared-data-models';

import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesExceptionFilter } from '../courses.exception-filter';
import type { CourseScopedRequest } from '../types/loaded-course';
import { NotificationsService } from './notifications.service';

/**
 * Owner-only new-module notification (US-07-03). `CourseOwnerGuard` loads and
 * authorizes the course (404 missing / 403 not-owner) and attaches it to the
 * request; the session guard supplies the authenticated user (401 otherwise).
 */
@Controller('courses')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Post(':cid/modules/:mid/notify')
  @HttpCode(200)
  @UseGuards(CourseOwnerGuard)
  notify(@Req() req: CourseScopedRequest, @Param('mid') mid: ModuleId): Promise<NotifyModuleResult> {
    if (!req.course) {
      return Promise.reject(
        new Error('NotificationsController: CourseOwnerGuard did not attach course'),
      );
    }
    return this.service.notifyNewModule(req.course, mid);
  }
}

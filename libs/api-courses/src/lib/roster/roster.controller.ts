import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';

import type { CourseRosterView } from '@learnwren/shared-data-models';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';

import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesExceptionFilter } from '../courses.exception-filter';
import type { CourseScopedRequest } from '../types/loaded-course';
import { RosterService } from './roster.service';

/**
 * Owner-only enrolled-students roster (US-07-01). `CourseOwnerGuard` loads and
 * authorizes the course (404 missing / 403 not-owner) and attaches it to the
 * request; the session guard supplies the authenticated user (401 otherwise).
 */
@Controller('courses')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)
export class RosterController {
  constructor(private readonly service: RosterService) {}

  @Get(':cid/students')
  @UseGuards(CourseOwnerGuard)
  getStudents(@Req() req: CourseScopedRequest): Promise<CourseRosterView> {
    if (!req.course) {
      // Stryker disable next-line StringLiteral: unreachable defensive guard — CourseOwnerGuard always attaches req.course before this runs; the message text is diagnostic-only and never asserted.
      return Promise.reject(new Error('RosterController: CourseOwnerGuard did not attach course'));
    }
    return this.service.getRoster(req.course);
  }
}
